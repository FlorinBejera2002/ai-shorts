package publishing

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/url"
	"strings"
)

// Carousel children process independently. Persist their ordered IDs so a slow
// video does not hold the worker open or force it to recreate remote containers.
type instagramCarousel struct {
	Children []string `json:"children"`
	Caption  string   `json:"caption"`
}

func (p *ProviderClient) createInstagramItems(ctx context.Context, account string, c Credentials, media []PublishMedia, caption string) (string, string, error) {
	carousel := instagramCarousel{Caption: caption}
	for _, item := range media {
		form := url.Values{"is_carousel_item": {"true"}}
		if item.Type == "video" {
			form.Set("media_type", "VIDEO")
			form.Set("video_url", item.URL)
		} else {
			form.Set("image_url", item.URL)
		}
		var child struct{ ID string }
		if err := p.request(ctx, "POST", p.graph("instagram", url.PathEscape(account)+"/media"), c.AccessToken, form, nil, &child); err != nil || child.ID == "" {
			return "", "unknown", errors.New("Instagram carousel item creation could not be confirmed")
		}
		carousel.Children = append(carousel.Children, child.ID)
	}
	raw, err := json.Marshal(carousel)
	if err != nil {
		return "", "unknown", err
	}
	return account + ":carousel:" + base64.RawURLEncoding.EncodeToString(raw), "processing", nil
}

func readInstagramCarousel(job string) (string, instagramCarousel, error) {
	var carousel instagramCarousel
	parts := strings.SplitN(job, ":", 3)
	if len(parts) != 3 || parts[1] != "carousel" || parts[0] == "" {
		return "", carousel, errors.New("invalid Instagram carousel job")
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil || json.Unmarshal(raw, &carousel) != nil || len(carousel.Children) < 2 || len(carousel.Children) > 10 {
		return "", carousel, errors.New("invalid Instagram carousel items")
	}
	for _, child := range carousel.Children {
		if child == "" {
			return "", carousel, errors.New("missing Instagram carousel item")
		}
	}
	return parts[0], carousel, nil
}

func (p *ProviderClient) pollInstagramItems(ctx context.Context, job string, c Credentials) (string, string, error) {
	_, carousel, err := readInstagramCarousel(job)
	if err != nil {
		return "failed", "", err
	}
	ready := true
	for _, child := range carousel.Children {
		var r struct {
			Status string `json:"status_code"`
		}
		if err := p.request(ctx, "GET", p.graph("instagram", url.PathEscape(child))+"?fields=status_code", c.AccessToken, nil, nil, &r); err != nil {
			return "processing", "", err
		}
		switch r.Status {
		case "FINISHED":
		case "ERROR", "EXPIRED":
			return "failed", "", errors.New("Instagram carousel item processing failed")
		default:
			ready = false
		}
	}
	if ready {
		return "carousel_ready", "", nil
	}
	return "processing", "", nil
}

// CreateCarousel is a mutation: the worker records submitting durably before
// calling it, just as it does before initial upload and final publication.
func (p *ProviderClient) CreateCarousel(ctx context.Context, job string, c Credentials) (string, error) {
	account, carousel, err := readInstagramCarousel(job)
	if err != nil {
		return "", err
	}
	var parent struct{ ID string }
	form := url.Values{"media_type": {"CAROUSEL"}, "children": {strings.Join(carousel.Children, ",")}, "caption": {carousel.Caption}}
	if err := p.request(ctx, "POST", p.graph("instagram", url.PathEscape(account)+"/media"), c.AccessToken, form, nil, &parent); err != nil {
		return "", err
	}
	if parent.ID == "" {
		return "", errors.New("missing Instagram carousel container ID")
	}
	return account + ":" + parent.ID, nil
}
