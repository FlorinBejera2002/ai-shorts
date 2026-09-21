package processing

import (
 "bytes"
 "context"
 "encoding/json"
 "fmt"
 "math"
 "os/exec"
 "strconv"
 "time"
)

type limitedBuffer struct { bytes.Buffer }
func (b *limitedBuffer) Write(p []byte)(int,error){ n:=len(p); if b.Len()<4<<20 { left:=(4<<20)-b.Len(); if len(p)>left {p=p[:left]}; _,_=b.Buffer.Write(p) }; return n,nil }
func run(ctx context.Context,dir,binary string,args ...string)([]byte,error){
 cmd:=exec.CommandContext(ctx,binary,args...); cmd.Dir=dir; cmd.WaitDelay=5*time.Second
 var stdout,stderr limitedBuffer; cmd.Stdout=&stdout; cmd.Stderr=&stderr
 if err:=cmd.Run(); err!=nil { if ctx.Err()!=nil{return nil,ctx.Err()}; return nil,fmt.Errorf("%s failed: %w: %s",binary,err,stderr.String()) }; return stdout.Bytes(),nil
}
type probeInfo struct { Width,Height int; Duration float64; Audio bool }
func (p *Processor) probe(ctx context.Context,file string)(probeInfo,error){
 b,err:=run(ctx,"",p.cfg.FFprobePath,"-v","error","-show_entries","format=duration:stream=codec_type,width,height","-of","json",file); if err!=nil{return probeInfo{},err}
 var raw struct{ Format struct{Duration string}; Streams []struct{CodecType string `json:"codec_type"`; Width,Height int} }; if err=json.Unmarshal(b,&raw);err!=nil{return probeInfo{},err}
 r:=probeInfo{}; r.Duration,_=strconv.ParseFloat(raw.Format.Duration,64); for _,s:=range raw.Streams {if s.CodecType=="video" && r.Width==0 {r.Width=s.Width;r.Height=s.Height}; if s.CodecType=="audio"{r.Audio=true}}
 if r.Width<2 || r.Height<2 || !finite(r.Duration) || r.Duration<=0 {return r,fmt.Errorf("invalid video dimensions or duration")}; return r,nil
}
func finite(v float64)bool{return !math.IsNaN(v)&&!math.IsInf(v,0)}
func seconds(v float64)string{return strconv.FormatFloat(v,'f',6,64)}
func (p *Processor) ffmpeg(ctx context.Context,dir string,args ...string)error{ _,err:=run(ctx,dir,p.cfg.FFmpegPath,append([]string{"-nostdin","-hide_banner","-loglevel","error","-y","-filter_complex_threads","1"},args...)...); return err }
var delivery=[]string{"-c:v","libx264","-preset","veryfast","-crf","20","-pix_fmt","yuv420p","-c:a","aac","-b:a","128k","-movflags","+faststart"}
