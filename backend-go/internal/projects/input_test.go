package projects

import "testing"

func TestProjectAndFolderValidation(t *testing.T) {
	blank := " "
	if (&ProjectUpdate{Name: &blank}).Validate() == nil {
		t.Fatal("blank project name accepted")
	}
	name := " Campaign "
	if p := (&ProjectUpdate{Name: &name}); p.Validate() != nil || *p.Name != "Campaign" {
		t.Fatal("valid project name rejected")
	}
	if (&FolderInput{Name: ""}).Validate() == nil {
		t.Fatal("blank folder accepted")
	}
	if (MoveClipInput{FolderID: pointer("nope")}).Validate() == nil {
		t.Fatal("invalid folder id accepted")
	}
}

func TestBrandValidation(t *testing.T) {
	bad := ProjectUpdate{BrandKit: []byte(`{"primaryColor":"red"}`)}
	if bad.Validate() == nil {
		t.Fatal("invalid brand color accepted")
	}
	good := ProjectUpdate{BrandKit: []byte(`{"name":"Launch","primaryColor":"#102030","secondaryColor":"#ffffff"}`)}
	if good.Validate() != nil {
		t.Fatal("valid brand rejected")
	}
}

func pointer(value string) *string { return &value }
