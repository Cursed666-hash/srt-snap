# SRT Snap

A professional SRT subtitle editor with a freemium business model. Built entirely client-side using HTML5 File API and Video API - your files never leave your computer.

## Overview

**Free Tier:** Upload SRT files, edit text, and download (basic functionality)

**PRO Tier:** $50 one-time purchase for advanced features:
- Timeline editor with drag-and-drop positioning
- Video sync for precise subtitle timing
- Pixel-perfect placement controls
- Advanced formatting and batch operations

## Features

### Free Features
✅ Upload and edit SRT files locally
✅ Download edited files
✅ Real-time preview
✅ Auto-save functionality
✅ Keyboard shortcuts (Ctrl+S for save)

### PRO Features (Unlock with $50 one-time purchase)
🎬 **Timeline Editor**
- Visual timeline representation
- Drag-and-drop subtitle blocks
- Precise positioning controls
- Timeline navigation

🎥 **Video Sync**
- Upload video files
- Synchronize subtitles with playback
- Real-time timing adjustments
- Frame-accurate positioning

⚙️ **Advanced Tools**
- Batch operations
- Advanced formatting
- Export options
- Multiple file support

## Technical Architecture

This application is built entirely client-side:

- **HTML5 File API**: Handle file uploads locally
- **Video API**: Video preview and sync functionality
- **Pure JavaScript**: SRT parsing and editing (minimal dependencies)
- **No server required**: All processing happens in your browser

**SRT Parsing**: ~20 lines of JavaScript for file parsing and validation

**Timeline Editor**: Primarily a UI challenge, not complex engineering

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/example/srt-editor.git
   cd srt-editor
   ```

2. Open `index.html` in your browser:
   ```bash
   open index.html
   # or
   start index.html
   ```

## Business Model

The freemium model is designed for maximum conversion:

- **Free tier** gives users enough functionality to get indexed, reviewed, and build word of mouth
- **PRO tier** ($50 one-time) delivers the premium experience creators actually need
- **Aegisub comparison**: Desktop-only, clunky UI, steep learning curve vs. clean browser-based timeline

## Usage

1. **Upload**: Click "Upload" tab and select your SRT file
2. **Edit**: Modify the subtitle text in the editor
3. **Preview**: Switch to "Preview" tab to see formatted output
4. **Download**: Save your edited file

**PRO Users**: Access timeline editor, video sync, and advanced features after purchase.

## Development

This project was built with:
- Modern HTML5 features
- CSS3 animations and responsive design
- Vanilla JavaScript (no framework dependencies)
- Mobile-friendly responsive design

## Contributing

Feel free to contribute! Issues and pull requests are welcome.

## License

Proprietary. See individual components for their respective licenses.

## Security

- All processing happens client-side
- No data is sent to servers
- Your SRT files remain on your computer

## Future Enhancements

- Cloud backup sync
- Collaboration features
- More video format support
- Export to multiple formats