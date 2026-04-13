package validate

import (
	"bytes"
	"fmt"
	"image"
	"image/jpeg"
	_ "image/png" // register png decoder
	"io"
	"net/http"

	"github.com/google/uuid"
)

const (
	MaxImageBytes       = 10 << 20 // 10 MB
	MaxImageDimension   = 4000
	JPEGReencodeQuality = 85
)

// SanitizeImage validates an image upload and returns a re-encoded JPEG byte
// slice with a server-generated filename. It rejects:
//   - declared Content-Length > MaxImageBytes
//   - MIME type outside jpeg/png (sniffed, not trusted from headers)
//   - files that fail to decode as a real image
//   - images exceeding MaxImageDimension on either axis
//
// Re-encoding strips EXIF metadata and defeats polyglot payloads.
func SanitizeImage(r io.Reader, contentLength int64) (out []byte, filename string, err error) {
	if contentLength > MaxImageBytes {
		return nil, "", fmt.Errorf("image too large: %d bytes (max %d)", contentLength, MaxImageBytes)
	}

	limited := io.LimitReader(r, MaxImageBytes+1)
	raw, err := io.ReadAll(limited)
	if err != nil {
		return nil, "", fmt.Errorf("read: %w", err)
	}
	if int64(len(raw)) > MaxImageBytes {
		return nil, "", fmt.Errorf("image too large (after read)")
	}

	head := raw
	if len(head) > 512 {
		head = head[:512]
	}
	mime := http.DetectContentType(head)
	switch mime {
	case "image/jpeg", "image/png":
		// ok
	default:
		return nil, "", fmt.Errorf("unsupported image type: %s", mime)
	}

	img, _, err := image.Decode(bytes.NewReader(raw))
	if err != nil {
		return nil, "", fmt.Errorf("decode: %w", err)
	}

	b := img.Bounds()
	if b.Dx() > MaxImageDimension || b.Dy() > MaxImageDimension {
		return nil, "", fmt.Errorf("image too large: %dx%d (max %dx%d)",
			b.Dx(), b.Dy(), MaxImageDimension, MaxImageDimension)
	}

	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: JPEGReencodeQuality}); err != nil {
		return nil, "", fmt.Errorf("encode: %w", err)
	}

	return buf.Bytes(), uuid.NewString() + ".jpg", nil
}
