package processing

import("context";"fmt";"io";"net/http";"net/url";"os";"strings";"time"; youtube "github.com/kkdai/youtube/v2")

const maximumSourceBytes int64 = 5<<30
func copyBounded(source io.Reader,dest string)error {f,e:=os.OpenFile(dest,os.O_CREATE|os.O_EXCL|os.O_WRONLY,0600);if e!=nil{return e};n,e:=io.Copy(f,io.LimitReader(source,maximumSourceBytes+1));closeErr:=f.Close();if e!=nil{return e};if n>maximumSourceBytes{return fmt.Errorf("source exceeds 5 GiB limit")};return closeErr}
func(p *Processor) materialize(ctx context.Context,key,dest string)error{
 if local,ok:=p.storage.(interface{Path(string)(string,error)});ok{path,e:=local.Path(key);if e!=nil{return e};f,e:=os.Open(path);if e!=nil{return e};defer f.Close();return copyBounded(f,dest)}
 address,e:=p.storage.SignedURL(ctx,key,time.Hour);if e!=nil{return e};req,e:=http.NewRequestWithContext(ctx,"GET",address,nil);if e!=nil{return e};client:=http.Client{Timeout:time.Hour};response,e:=client.Do(req);if e!=nil{return e};defer response.Body.Close();if response.StatusCode!=200{return fmt.Errorf("storage download status %d",response.StatusCode)};return copyBounded(response.Body,dest)
}
func youtubeURL(raw string)bool{u,e:=url.Parse(raw);if e!=nil||u.Scheme!="https"||u.User!=nil||u.Port()!=""{return false};switch strings.ToLower(u.Hostname()){case "youtube.com","www.youtube.com","m.youtube.com","youtu.be":return true};return false}
func(p *Processor) download(ctx context.Context,address,dest string)error{
 if !youtubeURL(address){return fmt.Errorf("only HTTPS YouTube source URLs are supported")}
 client:=youtube.Client{HTTPClient:&http.Client{Timeout:30*time.Minute}}
 video,e:=client.GetVideoContext(ctx,address);if e!=nil{return fmt.Errorf("YouTube metadata: %w",e)}
 formats:=video.Formats.WithAudioChannels();for _,format:=range formats{if format.Width==0||!strings.Contains(format.MimeType,"video/mp4"){continue};stream,_,err:=client.GetStreamContext(ctx,video,&format);if err!=nil{return err};defer stream.Close();return copyBounded(stream,dest)}
 return fmt.Errorf("YouTube video has no downloadable combined MP4 format")
}
