from PIL import Image, ImageDraw

def mask_logo(img_path, out_path):
    img = Image.open(img_path).convert('RGBA')
    pixels = img.load()
    width, height = img.size
    
    bg_color = pixels[0, 0] # Use top left
    mask = Image.new('L', img.size, 0)
    for y in range(height):
        for x in range(width):
            p = pixels[x, y]
            diff = sum(abs(p[i] - bg_color[i]) for i in range(3))
            if diff > 30:
                mask.putpixel((x, y), 255)
    
    bbox = mask.getbbox()
    if bbox:
        margin = 1
        bbox = (max(0, bbox[0]-margin), max(0, bbox[1]-margin), min(width, bbox[2]+margin), min(height, bbox[3]+margin))
        cropped = img.crop(bbox)
        
        c_width, c_height = cropped.size
        radius = int(c_width * 0.225)
        
        alpha = Image.new('L', cropped.size, 0)
        draw = ImageDraw.Draw(alpha)
        draw.rounded_rectangle((0, 0, c_width, c_height), radius=radius, fill=255)
        
        cropped.putalpha(alpha)
        
        # We need to maintain the alpha when resizing using latest Pillow
        # Wait, LANCZOS maintains alpha if we convert to RGBA which it is.
        try:
            resample_filter = Image.Resampling.LANCZOS
        except AttributeError:
            resample_filter = Image.LANCZOS
            
        final_img = cropped.resize((1024, 1024), resample_filter)
        final_img.save(out_path, 'PNG')
        print(f"Saved optimized logo to {out_path}")
    else:
        print("Could not find bounding box.")

if __name__ == '__main__':
    mask_logo('/Users/ramonandrio/.gemini/antigravity/brain/8d137995-b13f-4944-ab9f-330b4e4cbf90/media__1772516387531.jpg', '/Users/ramonandrio/Documents/Sublime-Markdown/markdown-viewer/build/icon.png')
