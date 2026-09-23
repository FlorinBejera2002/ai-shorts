package clips

import("context";"encoding/json";"net/url";"strings";"testing";"sneepcut/backend-go/internal/testdb")

func TestAgentLibraryUsesFiltersAndOmitsPrivateMedia(t *testing.T){
 db:=testdb.Open(t);user,_,clip:=seedClip(t,db);h:=New(db,fakeAuth{true},&fakeMedia{},Config{})
 result,err:=h.AgentLibrary(context.Background(),user,url.Values{"score":{"high"},"search":{"Fixture"},"page":{"999"}});if err!=nil{t.Fatal(err)}
 raw,_:=json.Marshal(result);if !strings.Contains(string(raw),clip)||strings.Contains(string(raw),"storage")||strings.Contains(string(raw),".mp4"){t.Fatal("unsafe or incorrect projection",string(raw))}
 result,err=h.AgentLibrary(context.Background(),user,url.Values{"score":{"low"}});if err!=nil||result["total"]!=0{t.Fatal("filter parity",result,err)}
 result,err=h.AgentLibrary(context.Background(),newID(),nil);if err!=nil||result["total"]!=0{t.Fatal("foreign library disclosed",result,err)}
}
