package worker

import (
 "context"
 "encoding/json"
 "sort"
 "time"
 "sneepcut/backend-go/internal/processing"
)
type orderedSegment struct{ Start float64 `json:"start"`;End float64 `json:"end"`;Order int `json:"order"` }
func (w *Worker) edit(parent context.Context,e *Edit)(err error) {
 ctx,cancel:=context.WithTimeout(parent,55*time.Minute);defer cancel();done:=make(chan struct{});defer close(done)
 go func(){tick:=time.NewTicker(30*time.Second);defer tick.Stop();for{select{case <-done:return;case <-ctx.Done():return;case <-tick.C:if w.Repo.EditActive(ctx,e)!=nil{cancel();return}}}}()
 namespace:=e.JobID+"/edits/"+e.ClipID+"/"+e.Token
 defer func(){if err!=nil{clean,stop:=context.WithTimeout(context.Background(),30*time.Second);defer stop();if finishErr:=w.Repo.FailEdit(clean,e);finishErr!=nil{w.Logger.Warn("Finalize edit","error",finishErr)};if _,cleanupErr:=w.Storage.DeletePrefix(clean,"clips/"+namespace);cleanupErr!=nil{w.Logger.Warn("Clean failed edit","error",cleanupErr)}}}()
 var payload struct {Start float64 `json:"start_time"`;End float64 `json:"end_time"`;Segments []orderedSegment `json:"segments"`};if err=json.Unmarshal(e.Payload,&payload);err!=nil{return err}
 in:=processing.RenderInput{Namespace:namespace,SourceKey:e.SourceKey,PreserveGeometry:true}
 if e.Kind=="trim" {in.SourceKey=e.FileKey;in.Segments=[]processing.Segment{{Start:payload.Start,End:payload.End}}}else{sort.SliceStable(payload.Segments,func(i,j int)bool{return payload.Segments[i].Order<payload.Segments[j].Order});for _,s:=range payload.Segments{in.Segments=append(in.Segments,processing.Segment{Start:s.Start,End:s.End})}}
 clip,err:=w.Pipeline.Render(ctx,in);if err!=nil{return err}
 if e.Kind=="trim"&&e.TikTokKey!=""{in.SourceKey=e.TikTokKey;in.Namespace=namespace+"/tiktok";tiktok,renderErr:=w.Pipeline.Render(ctx,in);if renderErr!=nil{return renderErr};clip.TikTokStorageKey=tiktok.StorageKey}
 if err=w.Repo.CompleteEdit(ctx,e,clip,payload.Segments);err!=nil{return err}
 old:=[]string{e.FileKey,e.TikTokKey};if e.Kind=="recut"{old=append(old,e.ThumbnailKey)}
 for _,key:=range old{if key!=""&&key!=clip.StorageKey&&key!=clip.TikTokStorageKey&&key!=clip.ThumbnailKey{if cleanupErr:=w.Storage.Delete(ctx,key);cleanupErr!=nil{w.Logger.Warn("Remove superseded edit object","error",cleanupErr)}}};return nil
}
