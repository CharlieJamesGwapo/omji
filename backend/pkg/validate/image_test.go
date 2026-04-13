package validate

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"strings"
	"testing"
)

func makeJPEG(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, color.RGBA{byte(x), byte(y), 0, 255})
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 80}); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestSanitizeImage_AcceptsValidJPEG(t *testing.T) {
	raw := makeJPEG(t, 100, 100)
	out, name, err := SanitizeImage(bytes.NewReader(raw), int64(len(raw)))
	if err != nil {
		t.Fatalf("unexpected: %v", err)
	}
	if !strings.HasSuffix(name, ".jpg") {
		t.Fatalf("expected .jpg suffix, got %q", name)
	}
	if len(out) == 0 {
		t.Fatal("empty output")
	}
}

func TestSanitizeImage_RejectsSVG(t *testing.T) {
	svg := []byte(`<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`)
	_, _, err := SanitizeImage(bytes.NewReader(svg), int64(len(svg)))
	if err == nil {
		t.Fatal("expected rejection")
	}
}

func TestSanitizeImage_RejectsHTMLPolyglot(t *testing.T) {
	polyglot := []byte("<html><body>not an image</body></html>")
	_, _, err := SanitizeImage(bytes.NewReader(polyglot), int64(len(polyglot)))
	if err == nil {
		t.Fatal("expected rejection")
	}
}

func TestSanitizeImage_RejectsOversize(t *testing.T) {
	raw := makeJPEG(t, 5000, 5000)
	_, _, err := SanitizeImage(bytes.NewReader(raw), int64(len(raw)))
	if err == nil {
		t.Fatal("expected dimension rejection")
	}
}

func TestSanitizeImage_RejectsContentLengthTooBig(t *testing.T) {
	_, _, err := SanitizeImage(bytes.NewReader([]byte("x")), 20*1024*1024)
	if err == nil {
		t.Fatal("expected size rejection")
	}
}
