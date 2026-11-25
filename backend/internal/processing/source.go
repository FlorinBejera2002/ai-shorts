package processing

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

const maximumSourceBytes int64 = 5 << 30

func copyBounded(source io.Reader, dest string) error {
	f, e := os.OpenFile(dest, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if e != nil {
		return e
	}
	n, e := io.Copy(f, io.LimitReader(source, maximumSourceBytes+1))
	closeErr := f.Close()
	if e != nil {
		return e
	}
	if n > maximumSourceBytes {
		return fmt.Errorf("source exceeds 5 GiB limit")
	}
	return closeErr
}

func (p *Processor) materialize(ctx context.Context, key, dest string) error {
	if local, ok := p.storage.(interface{ Path(string) (string, error) }); ok {
		path, e := local.Path(key)
		if e != nil {
			return e
		}
		f, e := os.Open(path)
		if e != nil {
			return e
		}
		defer f.Close()
		return copyBounded(f, dest)
	}
	address, e := p.storage.SignedURL(ctx, key, time.Hour)
	if e != nil {
		return e
	}
	req, e := http.NewRequestWithContext(ctx, "GET", address, nil)
	if e != nil {
		return e
	}
	client := http.Client{Timeout: time.Hour}
	response, e := client.Do(req)
	if e != nil {
		return e
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		return fmt.Errorf("storage download status %d", response.StatusCode)
	}
	return copyBounded(response.Body, dest)
}
