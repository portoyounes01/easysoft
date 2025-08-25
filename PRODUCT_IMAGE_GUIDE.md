# Product Image Management Guide

## Overview

The POS System now supports hybrid product image management with two convenient options:

1. **Upload Images**: Upload images directly from your computer or paste from clipboard
2. **Image URLs**: Enter direct links to images hosted online

## Features

### 🖼️ **Image Upload (Option 1)**

- **Drag & Drop**: Simply drag image files onto the upload area
- **File Picker**: Click the upload area to browse and select files
- **Clipboard Paste**: Copy an image (Ctrl+C/Cmd+C) and paste (Ctrl+V/Cmd+V) directly into the upload area
- **Automatic Storage**: Images are uploaded to Supabase Storage or converted to base64 as fallback
- **Progress Indicator**: See upload progress with visual feedback
- **File Validation**: Automatic validation for image types and file size (max 5MB)

### 🔗 **Image URL (Option 2)**

- **Direct URLs**: Enter any valid image URL (supports jpg, png, gif, webp, svg)
- **Real-time Validation**: Instant validation of URL format
- **External Hosting**: Use images from any public hosting service (Imgur, Cloudinary, etc.)

### 👀 **Image Preview & Management**

- **Live Preview**: See images as you add them
- **Full-Size View**: Click the eye icon to view images in full size
- **Copy URL**: Copy image URLs to clipboard
- **Remove Images**: Easy one-click removal
- **Error Handling**: Graceful fallback when images fail to load

## How to Use

### Adding Images to Products

1. **Open Product Form**:

   - Go to Products page → Click "Add Product"
   - Or edit existing product → Click edit button

2. **Navigate to Image Section**:

   - Scroll down to "Product Image" section
   - Choose between "Upload Image" or "Image URL" tabs

3. **Upload Method**:

   - **Drag & Drop**: Drag image file onto the upload area
   - **File Browser**: Click upload area → select file from computer
   - **Paste**: Copy image from anywhere → paste in upload area

4. **URL Method**:

   - Switch to "Image URL" tab
   - Paste or type image URL
   - Click "Apply" or press Enter

5. **Save Product**: Click "Save Product" to store the image

### Viewing Product Images

- **Products Table**: Small thumbnails appear next to product names
- **Product Details**: Full-size image display in product view modal
- **POS Interface**: Images display in product grid for easy identification

## Supported File Types

- **JPEG/JPG** - Standard photo format
- **PNG** - Transparent backgrounds supported
- **GIF** - Animated gifs supported
- **WEBP** - Modern web format
- **SVG** - Vector graphics

## File Size Limits

- **Maximum**: 5MB per image
- **Recommendation**: Use 500KB or less for best performance
- **Optimal Size**: 300x300px to 800x800px

## Storage Options

### Supabase Storage (Primary)

- Automatic upload to your Supabase project
- CDN delivery for fast loading
- Integrated with your database
- Requires Supabase configuration

### Base64 Fallback (Secondary)

- Automatic fallback if Supabase unavailable
- Stores image data directly in database
- Works offline
- Larger database size

## Setup Instructions

### For Supabase Storage (Recommended)

1. **Configure Environment**:

   ```bash
   # Add to your .env file
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

2. **Setup Storage Bucket**:

   - Run the SQL commands in `supabase_storage_setup.sql`
   - This creates the `product-images` bucket with proper permissions

3. **Test Upload**:
   - Add a new product and upload an image
   - Verify image appears in Supabase Storage dashboard

### For URL-Only Usage (Alternative)

1. **Use External Hosting**:

   - Upload images to Imgur, Cloudinary, or your website
   - Copy direct image URLs
   - Paste URLs in the "Image URL" tab

2. **Free Image Hosting Services**:
   - **Imgur**: Free, reliable, easy to use
   - **Cloudinary**: Professional features, free tier
   - **GitHub**: Use repository assets for static images

## Best Practices

### Image Quality

- Use high-quality images for better customer experience
- Ensure good lighting and clear product visibility
- Use consistent backgrounds for professional appearance

### Performance

- Optimize images before upload (reduce file size)
- Use appropriate dimensions (not too large)
- Consider using WebP format for smaller file sizes

### Organization

- Use descriptive filenames before upload
- Maintain consistent image style across products
- Regular cleanup of unused images

## Troubleshooting

### Upload Issues

- **File too large**: Reduce image size to under 5MB
- **Invalid format**: Use supported formats (jpg, png, gif, webp, svg)
- **Upload fails**: Check internet connection and Supabase configuration

### URL Issues

- **Image not loading**: Verify URL is publicly accessible
- **Invalid URL**: Ensure URL points directly to image file
- **Broken images**: Use preview to test before saving

### Display Issues

- **Images not showing**: Check browser console for errors
- **Slow loading**: Optimize image size or use different hosting
- **Missing thumbnails**: Verify image URLs are still valid

## Security Notes

- Only authenticated users can upload images
- File type validation prevents malicious uploads
- Storage policies control access permissions
- Regular cleanup recommended for storage management

## Future Enhancements

- Automatic image resizing and optimization
- Bulk image upload for multiple products
- Image gallery for reusing uploaded images
- Integration with barcode scanning for auto-image lookup
