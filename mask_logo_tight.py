from PIL import Image, ImageDraw

def mask_logo_tight(img_path, out_path):
    img = Image.open(img_path).convert('RGBA')
    width, height = img.size
    
    # We want to crop from the outer grey canvas to the actual black/white content.
    # Looking at the original 1024x1024 image, the grey border is quite thick.
    # Let's find the first pixel from the center going outwards, or from the edge going inwards that is clearly dark or white
    
    pixels = img.load()
    
    # Scan from top to bottom at center x
    top_edge = 0
    center_x = width // 2
    for y in range(height):
        r, g, b, _ = pixels[center_x, y]
        # It should hit the black top half.
        if r < 100 and g < 100 and b < 100:
            top_edge = y
            break
            
    # Scan from bottom to top at center x
    bottom_edge = height - 1
    for y in range(height-1, -1, -1):
        r, g, b, _ = pixels[center_x, y]
        # It should hit the white bottom half.
        if r > 240 and g > 240 and b > 240:
            bottom_edge = y
            break
            
    # Scan from left to right at center y
    left_edge = 0
    center_y = height // 2
    for x in range(width):
        r, g, b, _ = pixels[x, center_y]
        # Left side is black/white boundary, let's just look at the middle of top half
        r2, g2, b2, _ = pixels[x, height // 4]
        if r2 < 100 and g2 < 100 and b2 < 100:
            left_edge = x
            break
            
    # Scan from right to left at center y
    right_edge = width - 1
    for x in range(width-1, -1, -1):
        # Right side is white/black boundary, look at middle of bottom half
        r2, g2, b2, _ = pixels[x, height * 3 // 4]
        if r2 > 240 and g2 > 240 and b2 > 240:
            right_edge = x
            break

    print(f"Detected edges: top={top_edge}, bottom={bottom_edge}, left={left_edge}, right={right_edge}")
    
    # Let's add a small margin inwards to be absolutely sure the grey is gone
    margin = 5
    bbox = (left_edge + margin, top_edge + margin, right_edge - margin, bottom_edge - margin)
    
    print(f"Cropping to bbox: {bbox}")
    cropped = img.crop(bbox)
    
    c_width, c_height = cropped.size
    radius = int(c_width * 0.225)
    
    alpha = Image.new('L', cropped.size, 0)
    draw = ImageDraw.Draw(alpha)
    draw.rounded_rectangle((0, 0, c_width, c_height), radius=radius, fill=255)
    
    cropped.putalpha(alpha)
    
    try:
        resample_filter = Image.Resampling.LANCZOS
    except AttributeError:
        resample_filter = Image.LANCZOS
        
    final_img = cropped.resize((1024, 1024), resample_filter)
    final_img.save(out_path, 'PNG')
    print(f"Saved optimized tight logo to {out_path}")

if __name__ == '__main__':
    mask_logo_tight('/Users/ramonandrio/.gemini/antigravity/brain/8d137995-b13f-4944-ab9f-330b4e4cbf90/media__1772516387531.jpg', '/Users/ramonandrio/Documents/Sublime-Markdown/markdown-viewer/build/icon.png')
