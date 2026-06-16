// SRT Snap - Main JavaScript
// Client-side SRT file processing with freemium features

class SRTFileEditor {
    constructor() {
        this.currentSRT = null;
        this.isProUser = false;
        this.selectedFile = null;
        this.init();
    }

    init() {
        // Check for PRO status from localStorage
        if (localStorage.getItem('isProUser') === 'true') {
            this.isProUser = true;
        }

        // Setup UI event listeners
        this.setupEventListeners();

        // Load sample SRT if no file is present
        if (!this.currentSRT) {
            this.loadSampleSRT();
        }

        // Update UI based on user status
        this.updateUI();
    }

    setupEventListeners() {
        // File upload handling
        const fileInput = document.getElementById('file-input');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                this.handleFileUpload(e.target.files[0]);
            });
        }

        // Drag and drop functionality
        const uploadArea = document.getElementById('upload-area');
        if (uploadArea) {
            uploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadArea.style.borderColor = '#4CAF50';
                uploadArea.style.background = '#f8f8f8';
            });

            uploadArea.addEventListener('dragleave', (e) => {
                e.preventDefault();
                uploadArea.style.borderColor = '#ddd';
                uploadArea.style.background = 'white';
            });

            uploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadArea.style.borderColor = '#ddd';
                uploadArea.style.background = 'white';

                const file = e.dataTransfer.files[0];
                if (file && file.name.endsWith('.srt')) {
                    this.handleFileUpload(file);
                } else {
                    this.showError('Please upload a valid .srt file');
                }
            });
        }

        // Tab switching
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.target.getAttribute('data-tab');
                this.switchTab(tabName);
            });
        });
    }

    handleFileUpload(file) {
        if (!file.name.endsWith('.srt')) {
            this.showError('Please upload a valid .srt file');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;
            this.currentSRT = content;
            this.selectedFile = file;
            this.displayFileInfo(file);
            this.populateEditor(content);
            this.switchTab('editor');
            this.showSuccess('SRT file uploaded successfully!');
        };
        reader.readAsText(file);
    }

    displayFileInfo(file) {
        const fileList = document.getElementById('file-list');
        if (!fileList) return;

        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.innerHTML = `
            <div class="file-icon">📄</div>
            <div class="file-info">
                <div class="file-name">${file.name}</div>
                <div class="file-size">Size: ${(file.size / 1024).toFixed(2)} KB</div>
            </div>
            <button class="btn btn-danger" onclick="editor.removeFile()">Remove</button>
        `;

        fileList.innerHTML = '';
        fileList.appendChild(fileItem);
    }

    populateEditor(content) {
        const editor = document.getElementById('srt-editor');
        if (editor) {
            editor.textContent = content;
        }
    }

    getEditorContent() {
        const editor = document.getElementById('srt-editor');
        return editor ? editor.textContent.trim() : '';
    }

    downloadSRT() {
        if (!this.currentSRT) {
            this.showError('No SRT file to download');
            return;
        }

        const blob = new Blob([this.currentSRT], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = this.selectedFile ? this.selectedFile.name : 'subtitle.srt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showSuccess('SRT file downloaded successfully!');
    }

    newSRT() {
        if (confirm('Create a new SRT file? Any unsaved changes will be lost.')) {
            this.removeFile();
            this.loadSampleSRT();
            this.switchTab('upload');
        }
    }

    removeFile() {
        this.currentSRT = null;
        this.selectedFile = null;
        const fileList = document.getElementById('file-list');
        if (fileList) fileList.innerHTML = '';
        const editor = document.getElementById('srt-editor');
        if (editor) editor.textContent = '';
    }

    switchTab(tabName) {
        // Hide all tab contents
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
        });

        // Show selected tab
        const activeTab = document.getElementById(tabName + '-tab');
        if (activeTab) activeTab.classList.add('active');

        const activeNavTab = document.querySelector(`[data-tab="${tabName}"]`);
        if (activeNavTab) activeNavTab.classList.add('active');
    }

    loadSampleSRT() {
        const sampleContent = `1
00:00:00,000 --> 00:00:05,000
Hello and welcome to the SRT Editor.

2
00:00:05,000 --> 00:00:10,000
This is a sample subtitle file.

3
00:00:10,000 --> 00:00:15,000
You can edit this to see how it works.

4
00:00:15,000 --> 00:00:20,000
Enjoy using the SRT Editor!`;

        this.currentSRT = sampleContent;
        this.populateEditor(sampleContent);
    }

    updateUI() {
        // Update PRO features visibility
        if (this.isProUser) {
            const lockInfo = document.getElementById('lock-info');
            if (lockInfo) lockInfo.classList.add('hidden');

            const timelinePreview = document.getElementById('timeline-preview');
            if (timelinePreview) timelinePreview.classList.add('active');

            const videoPreview = document.getElementById('video-preview');
            if (videoPreview) videoPreview.classList.add('active');

            // Initialize PRO features
            this.initializePROFeatures();
        }
    }

    initializePROFeatures() {
        // Initialize timeline functionality
        this.initTimeline();

        // Initialize video functionality
        this.initVideo();

        // Enable contenteditable
        const editor = document.getElementById('srt-editor');
        if (editor) editor.contentEditable = 'true';
    }

    initTimeline() {
        const timelineContainer = document.getElementById('timeline-container');
        if (!timelineContainer) return;

        // Create timeline blocks
        for (let i = 0; i < 5; i++) {
            const block = document.createElement('div');
            block.className = 'timeline-block';
            block.textContent = (i + 1).toString();
            block.style.cssText = `
                position: absolute;
                left: ${i * 60}px;
                top: 20px;
                width: 50px;
                height: 35px;
                background: ${i % 2 === 0 ? '#4CAF50' : '#2196F3'};
                border-radius: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-weight: bold;
                cursor: grab;
                user-select: none;
                transition: transform 0.2s;
            `;

            block.addEventListener('click', () => {
                this.selectTimelineBlock(block);
            });

            timelineContainer.appendChild(block);
        }
    }

    selectTimelineBlock(block) {
        // Remove previous selection
        document.querySelectorAll('.timeline-block').forEach(b => {
            b.style.border = 'none';
        });

        // Add selection to clicked block
        block.style.border = '2px solid #ff9800';

        // Update editor with timing info
        const editor = document.getElementById('srt-editor');
        if (editor) {
            const currentContent = editor.textContent;
            editor.textContent = `[Timeline Position: Block ${block.textContent}]\n${currentContent}`;
        }
    }

    initVideo() {
        const videoContainer = document.getElementById('video-container');
        if (!videoContainer) return;

        videoContainer.innerHTML = `
            <video style="width: 100%; height: 100%; object-fit: contain; border-radius: 4px;" controls>
                <source src="#" type="video/mp4">
                Your browser does not support the video tag.
            </video>
            <div style="margin-top: 10px; text-align: center;">
                <input type="file" accept="video/*" style="display: none;" id="video-input">
                <button class="btn btn-primary" onclick="document.getElementById('video-input').click()">
                    Upload Video
                </button>
            </div>
        `;

        // Handle video upload
        const videoInput = document.getElementById('video-input');
        if (videoInput) {
            videoInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const videoUrl = URL.createObjectURL(file);
                    const video = videoContainer.querySelector('video source');
                    if (video) {
                        video.src = videoUrl;
                        video.load();
                        this.showSuccess('Video uploaded successfully!');
                    }
                }
            });
        }
    }

    unlockPro() {
        this.isProUser = true;
        localStorage.setItem('isProUser', 'true');

        // Update UI
        this.updateUI();

        // Show success message
        this.showSuccess('PRO license activated! You now have access to all features.');

        // Switch to editor tab
        this.switchTab('editor');
    }

    showSuccess(message) {
        const successMsg = document.getElementById('success-message');
        if (successMsg) {
            successMsg.textContent = message;
            successMsg.classList.remove('hidden');
            successMsg.classList.add('show');

            setTimeout(() => {
                successMsg.classList.remove('show');
            }, 3000);
        }
    }

    showError(message) {
        const errorMsg = document.getElementById('error-message');
        if (errorMsg) {
            errorMsg.textContent = message;
            errorMsg.classList.remove('hidden');
            errorMsg.classList.add('show');

            setTimeout(() => {
                errorMsg.classList.remove('show');
            }, 5000);
        }
    }

    parseSRT(content) {
        const blocks = content.split('\n\n').filter(block => block.trim());
        return blocks.map(block => {
            const lines = block.split('\n');
            const sequence = lines[0];
            const timing = lines[1];
            const text = lines.slice(2).join('\n');
            return { sequence, timing, text };
        });
    }

    generatePreview(content) {
        const blocks = this.parseSRT(content);
        let previewHtml = '';

        blocks.forEach(block => {
            previewHtml += `
                <div class="subtitle-block">
                    <div class="subtitle-sequence">${block.sequence}</div>
                    <div class="subtitle-timing">${block.timing}</div>
                    <div class="subtitle-text">${block.text}</div>
                </div>
            `;
        });

        return previewHtml;
    }

    // Auto-save functionality
    setupAutoSave() {
        const editor = document.getElementById('srt-editor');
        if (!editor) return;

        let saveTimeout;

        editor.addEventListener('input', () => {
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => {
                this.currentSRT = this.getEditorContent();
                this.showSuccess('Auto-saved');
            }, 2000);
        });
    }

    // Keyboard shortcuts
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.downloadSRT();
            }

            if (e.ctrlKey && e.key === 'n') {
                e.preventDefault();
                this.newSRT();
            }

            if (e.ctrlKey && e.key === 'u') {
                e.preventDefault();
                document.getElementById('file-input').click();
            }
        });
    }

    // Public API methods
    getCurrentContent() {
        return this.currentSRT;
    }

    isUserPro() {
        return this.isProUser;
    }

    upgradeToPro() {
        this.unlockPro();
    }

    loadSRT(content) {
        this.currentSRT = content;
        this.populateEditor(content);
    }

    getParsedSRT() {
        if (!this.currentSRT) return [];
        return this.parseSRT(this.currentSRT);
    }

    exportSRT(format = 'srt') {
        if (!this.currentSRT) {
            this.showError('No content to export');
            return;
        }

        let exportContent = this.currentSRT;

        if (format === 'txt') {
            // Convert to plain text
            const blocks = this.parseSRT(this.currentSRT);
            exportContent = blocks.map(block => block.text).join('\n\n');
        }

        const blob = new Blob([exportContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `exported.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showSuccess(`Exported as ${format.toUpperCase()}!`);
    }

    // Initialize everything
    start() {
        this.setupAutoSave();
        this.setupKeyboardShortcuts();

        // Setup preview generation
        const previewBtn = document.getElementById('preview-btn');
        if (previewBtn) {
            previewBtn.addEventListener('click', () => {
                const content = this.getEditorContent();
                if (content) {
                    const preview = this.generatePreview(content);
                    document.getElementById('srt-preview').innerHTML = preview;
                    this.switchTab('preview');
                }
            });
        }
    }
}

// Initialize editor when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Create global editor instance
    window.editor = new SRTFileEditor();

    // Start the editor
    window.editor.start();

    // Setup preview button if it exists
    const previewBtn = document.getElementById('preview-btn');
    if (previewBtn) {
        previewBtn.addEventListener('click', () => {
            const content = window.editor.getEditorContent();
            if (content) {
                const preview = window.editor.generatePreview(content);
                document.getElementById('srt-preview').innerHTML = preview;
                window.editor.switchTab('preview');
            }
        });
    }
});

// Global functions for HTML button clicks
function downloadSRT() {
    if (window.editor) window.editor.downloadSRT();
}

function newSRT() {
    if (window.editor) window.editor.newSRT();
}

function clearEditor() {
    if (window.editor) window.editor.removeFile();
}

function unlockPro() {
    if (window.editor) window.editor.unlockPro();
}

function previewSRT() {
    const content = window.editor ? window.editor.getEditorContent() : '';
    if (content) {
        const preview = window.editor ? window.editor.generatePreview(content) : '';
        document.getElementById('srt-preview').innerHTML = preview;
        window.editor ? window.editor.switchTab('preview') : null;
    }
}