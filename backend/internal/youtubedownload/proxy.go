package youtubedownload

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/netip"
	"strings"
	"sync"
	"time"
)

// The downloader's HTTPS traffic goes through a local allowlist proxy. Resolve
// once and dial the vetted address, so DNS rebinding cannot reach the LAN.
func allowedHost(host string) bool {
	host = strings.ToLower(host)
	for _, domain := range []string{"youtube.com", "googlevideo.com", "ytimg.com", "youtubei.googleapis.com"} {
		if host == domain || strings.HasSuffix(host, "."+domain) {
			return true
		}
	}
	return false
}

func publicIP(ip netip.Addr) bool {
	ip = ip.Unmap()
	if ip.Is6() && !netip.MustParsePrefix("2000::/3").Contains(ip) {
		return false
	}
	if !ip.IsGlobalUnicast() || ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() {
		return false
	}
	for _, cidr := range []string{"0.0.0.0/8", "100.64.0.0/10", "192.0.0.0/24", "192.0.2.0/24", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "240.0.0.0/4", "2001:db8::/32", "2001::/32", "2002::/16"} {
		if netip.MustParsePrefix(cidr).Contains(ip) {
			return false
		}
	}
	return true
}

func startProxy(ctx context.Context) (string, func(), error) {
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		return "", nil, err
	}
	var mu sync.Mutex
	connections := map[net.Conn]bool{}
	closed := false
	slots := make(chan struct{}, 16)
	server := &http.Server{ReadHeaderTimeout: 10 * time.Second, MaxHeaderBytes: 8192}
	server.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host, port, e := net.SplitHostPort(r.Host)
		if r.Method != http.MethodConnect || e != nil || port != "443" || !allowedHost(host) {
			http.Error(w, "Destination not allowed", http.StatusForbidden)
			return
		}
		select {
		case slots <- struct{}{}:
			defer func() { <-slots }()
		default:
			http.Error(w, "Too many connections", 503)
			return
		}
		addresses, e := net.DefaultResolver.LookupNetIP(ctx, "ip", host)
		if e != nil || len(addresses) == 0 {
			http.Error(w, "DNS lookup failed", 502)
			return
		}
		for _, address := range addresses {
			if !publicIP(address) {
				http.Error(w, "Destination not allowed", 403)
				return
			}
		}
		var upstream net.Conn
		for _, address := range addresses {
			upstream, e = (&net.Dialer{Timeout: 15 * time.Second}).DialContext(ctx, "tcp", net.JoinHostPort(address.String(), "443"))
			if e == nil {
				break
			}
		}
		if e != nil {
			http.Error(w, "Connection failed", 502)
			return
		}
		defer upstream.Close()
		hijacker, ok := w.(http.Hijacker)
		if !ok {
			http.Error(w, "Tunnel unavailable", 500)
			return
		}
		client, buffered, e := hijacker.Hijack()
		if e != nil {
			return
		}
		defer client.Close()
		mu.Lock()
		if closed {
			mu.Unlock()
			return
		}
		connections[client], connections[upstream] = true, true
		mu.Unlock()
		defer func() { mu.Lock(); delete(connections, client); delete(connections, upstream); mu.Unlock() }()
		_ = client.SetDeadline(time.Now().Add(time.Hour))
		_ = upstream.SetDeadline(time.Now().Add(time.Hour))
		if _, e = buffered.WriteString("HTTP/1.1 200 Connection Established\r\n\r\n"); e != nil {
			return
		}
		if e = buffered.Flush(); e != nil {
			return
		}
		done := make(chan struct{})
		go func() { _, _ = io.Copy(upstream, buffered); _ = upstream.Close(); close(done) }()
		_, _ = io.Copy(client, upstream)
		_ = client.Close()
		<-done
	})
	go func() {
		if e := server.Serve(listener); e != nil && !errors.Is(e, http.ErrServerClosed) {
			_ = listener.Close()
		}
	}()
	stop := sync.OnceFunc(func() {
		_ = server.Close()
		mu.Lock()
		closed = true
		for conn := range connections {
			_ = conn.Close()
		}
		mu.Unlock()
	})
	return "http://" + listener.Addr().String(), stop, nil
}
