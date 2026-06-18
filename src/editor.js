/* =============================================
   SRT Snap — PowerDirector-style Timeline Editor
   Video player, multitrack timeline, audio
   waveform, vocal detection, subtitle blocks
   ============================================= */

const TimelineEditor = (() => {
    // ---- State ----
    let state = {
        videoFile: null,
        videoUrl: null,
        videoDuration: 0,
        currentTime: 0,
        isPlaying: false,
        zoom: 1,
        snapEnabled: true,
        subtitles: [],
        audioBuffer: null,
        waveformData: null,
        vocalSegments: [],
        selectedSubIndex: -1,
        isDragging: false,
        dragType: null, // 'move' | 'resize-left' | 'resize-right'
        dragStartX: 0,
        dragStartTime: 0,
        dragSubIndex: -1,
        fps: 30,
        playbackRate: 1,
        mediaRecorder: null,
        recordedChunks: [],
        extractedSubtitles: null,
        isInlineEditing: false
    };

    // ---- DOM refs (set during init) ----
    let els = {};

    // ---- Constants ----
    const PIXELS_PER_SECOND_BASE = 80;
    const TRACK_HEIGHT = 60;
    const TRACK_LABEL_WIDTH = 120;
    const TIMELINE_HEADER_HEIGHT = 30;
    const MIN_ZOOM = 0.25;
    const MAX_ZOOM = 8;
    const VOCAL_THRESHOLD = 0.15;
    const VOCAL_LOW_FREQ = 300;
    const VOCAL_HIGH_FREQ = 3000;
    const FFT_SIZE = 2048;

    // =============================================
    // SUBTITLE PARSING
    // =============================================
    function parseSRT(content) {
        const blocks = [];
        const entries = content.trim().split(/\n\n+/);
        for (const entry of entries) {
            const lines = entry.trim().split('\n');
            if (lines.length < 3) continue;
            const numLine = lines[0].trim();
            if (!/^\d+$/.test(numLine)) continue;
            const timingLine = lines[1].trim();
            const text = lines.slice(2).join('\n').trim();
            const match = timingLine.match(
                /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/
            );
            if (!match) continue;
            const start = toSeconds(match[1], match[2], match[3], match[4]);
            const end = toSeconds(match[5], match[6], match[7], match[8]);
            blocks.push({
                index: blocks.length,
                sequence: parseInt(numLine),
                start,
                end,
                text,
                duration: end - start
            });
        }
        return blocks;
    }

    function toSeconds(h, m, s, ms) {
        return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s) + parseInt(ms) / 1000;
    }

    function formatTime(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const f = Math.floor((seconds % 1) * 30);
        return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(f)}`;
    }
    function pad(n) { return n.toString().padStart(2, '0'); }
    function formatTimeShort(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${pad(m)}:${pad(s)}`;
    }

    // =============================================
    // SRT GENERATION
    // =============================================
    function generateSRT(subtitles) {
        return subtitles.map((sub, i) => {
            const start = formatSRTTime(sub.start);
            const end = formatSRTTime(sub.end);
            return `${i + 1}\n${start} --> ${end}\n${sub.text}`;
        }).join('\n\n');
    }

    function formatSRTTime(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 1000);
        return `${pad(h)}:${pad(m)}:${pad(s)},${ms.toString().padStart(3, '0')}`;
    }

    // =============================================
    // VIDEO SUBTITLE EXTRACTION (Pro feature)
    // =============================================
    function extractSubtitlesFromVideo(file) {
        return new Promise((resolve, reject) => {
            // For WebVTT / embedded subtitles in MP4/MKV
            // We attempt to read raw subtitle tracks
            const video = document.createElement('video');
            video.preload = 'metadata';
            const url = URL.createObjectURL(file);
            video.src = url;

            video.addEventListener('loadedmetadata', () => {
                // Check for text tracks
                const tracks = video.textTracks;
                if (tracks && tracks.length > 0) {
                    const cues = [];
                    for (let i = 0; i < tracks.length; i++) {
                        const track = tracks[i];
                        if (track.cues) {
                            for (let j = 0; j < track.cues.length; j++) {
                                const cue = track.cues[j];
                                cues.push({
                                    start: cue.startTime,
                                    end: cue.endTime,
                                    text: cue.text
                                });
                            }
                        }
                    }
                    URL.revokeObjectURL(url);
                    if (cues.length > 0) {
                        resolve(cues);
                        return;
                    }
                }

                // Fallback: try to read through canvas/OCR is not feasible
                // We'll parse any embedded subtitle files in the container
                // For now, return empty and let user upload SRT separately
                URL.revokeObjectURL(url);
                resolve(null);
            });

            video.addEventListener('error', () => {
                URL.revokeObjectURL(url);
                reject(new Error('Could not load video metadata'));
            });

            // Timeout after 10s
            setTimeout(() => {
                URL.revokeObjectURL(url);
                reject(new Error('Video metadata loading timed out'));
            }, 10000);
        });
    }

    // =============================================
    // AUDIO ANALYSIS & VOCAL DETECTION
    // =============================================
    async function analyzeAudio(audioBuffer) {
        const numChannels = audioBuffer.numberOfChannels;
        const length = audioBuffer.length;
        const sampleRate = audioBuffer.sampleRate;
        const duration = audioBuffer.duration;

        // Get audio data from first channel
        const channelData = audioBuffer.getChannelData(0);

        // Downsample for waveform display (aim for ~1 sample per pixel at default zoom)
        const waveformTarget = 1200;
        const waveformStep = Math.max(1, Math.floor(length / waveformTarget));
        const waveformData = [];
        for (let i = 0; i < length; i += waveformStep) {
            let sum = 0;
            const end = Math.min(i + waveformStep, length);
            for (let j = i; j < end; j++) {
                sum += Math.abs(channelData[j]);
            }
            waveformData.push(sum / (end - i));
        }

        // Vocal detection: analyze frequency content over time windows
        const windowSize = Math.floor(sampleRate * 0.05); // 50ms windows
        const hopSize = Math.floor(windowSize * 0.5); // 50% overlap
        const vocalSegments = [];
        let inVocal = false;
        let vocalStart = 0;
        let windowIndex = 0;

        // Use offline analysis
        const offlineCtx = new OfflineAudioContext(1, length, sampleRate);
        const bufferSource = offlineCtx.createBufferSource();
        bufferSource.buffer = audioBuffer;

        const analyser = offlineCtx.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        const bufferLen = analyser.frequencyBinCount;
        const freqData = new Uint8Array(bufferLen);

        bufferSource.connect(analyser);
        analyser.connect(offlineCtx.destination);
        bufferSource.start();

        const renderedBuffer = await offlineCtx.startRendering();
        const renderedData = renderedBuffer.getChannelData(0);

        // Process in chunks for vocal detection
        const chunkSize = Math.floor(sampleRate * 0.1); // 100ms
        for (let i = 0; i < renderedData.length; i += chunkSize) {
            const chunkEnd = Math.min(i + chunkSize, renderedData.length);
            
            // Simple energy-based vocal estimation:
            // Compute energy in voice frequency range by band-pass approximation
            let voiceEnergy = 0;
            let totalEnergy = 0;
            
            for (let j = i; j < chunkEnd; j++) {
                const sample = renderedData[j];
                totalEnergy += sample * sample;
            }
            
            // For vocal band estimation, we simulate by looking at
            // zero-crossing rate + energy variation (voiced speech has
            // regular low-frequency structure)
            let zeroCrossings = 0;
            for (let j = i + 1; j < chunkEnd; j++) {
                if ((renderedData[j] >= 0 && renderedData[j - 1] < 0) ||
                    (renderedData[j] < 0 && renderedData[j - 1] >= 0)) {
                    zeroCrossings++;
                }
            }
            const zcr = zeroCrossings / chunkSize;
            
            // Speech typically has ZCR between 0.02 and 0.1
            // and significant energy
            const energy = totalEnergy / chunkSize;
            const isSpeech = energy > 0.0005 && zcr > 0.015 && zcr < 0.12;

            // Also use the actual frequency data from the analyser
            // (we re-render chunks for frequency analysis)
            if (isSpeech) {
                if (!inVocal) {
                    vocalStart = i / sampleRate;
                    inVocal = true;
                }
            } else {
                if (inVocal) {
                    const duration = (i / sampleRate) - vocalStart;
                    if (duration > 0.3) { // Minimum 300ms vocal segment
                        vocalSegments.push({ start: vocalStart, end: i / sampleRate });
                    }
                    inVocal = false;
                }
            }
        }

        // Close last segment
        if (inVocal) {
            const end = renderedData.length / sampleRate;
            if (end - vocalStart > 0.3) {
                vocalSegments.push({ start: vocalStart, end });
            }
        }

        // Merge nearby segments (< 0.5s gap)
        const mergedSegments = [];
        for (const seg of vocalSegments) {
            if (mergedSegments.length === 0) {
                mergedSegments.push({ ...seg });
            } else {
                const last = mergedSegments[mergedSegments.length - 1];
                if (seg.start - last.end < 0.5) {
                    last.end = seg.end;
                } else {
                    mergedSegments.push({ ...seg });
                }
            }
        }

        state.audioBuffer = audioBuffer;
        state.waveformData = waveformData;
        state.vocalSegments = mergedSegments;
        state.videoDuration = duration;

        return { waveformData, vocalSegments: mergedSegments, duration };
    }

    // =============================================
    // TIMELINE RENDERING
    // =============================================
    function renderTimeline() {
        const container = els.timelineContainer;
        if (!container) return;
        if (!state.videoFile && state.subtitles.length === 0) {
            container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--c-gray);font-size:0.9rem;">
                <div style="text-align:center;">
                    <div style="font-size:2.5rem;margin-bottom:8px;">🎬</div>
                    <div>Upload a video or load an SRT file to begin</div>
                    <div style="font-size:0.82rem;margin-top:6px;color:var(--c-gray-dark);">Pro users: drag video to extract embedded subtitles</div>
                </div>
            </div>`;
            return;
        }

        const duration = state.videoDuration || (state.subtitles.length > 0 ? 
            Math.max(...state.subtitles.map(s => s.end)) + 5 : 60);
        const pixelsPerSec = PIXELS_PER_SECOND_BASE * state.zoom;
        const totalWidth = Math.max(duration * pixelsPerSec, container.clientWidth - TRACK_LABEL_WIDTH);

        container.innerHTML = '';
        container.style.position = 'relative';
        container.style.overflow = 'auto';

        // Build inner container
        const inner = document.createElement('div');
        inner.style.cssText = `position:relative;min-width:${totalWidth + TRACK_LABEL_WIDTH}px;`;

        // ---- Time Ruler ----
        const ruler = createRuler(duration, pixelsPerSec);
        inner.appendChild(ruler);

        // ---- Tracks ----
        let trackTop = TIMELINE_HEADER_HEIGHT;

        // Video track (thumbnail strip)
        if (state.videoFile) {
            const videoTrack = createVideoTrack(duration, pixelsPerSec, trackTop);
            inner.appendChild(videoTrack);
            trackTop += TRACK_HEIGHT + 2;
        }

        // Audio track with waveform
        if (state.waveformData) {
            const audioTrack = createAudioTrack(duration, pixelsPerSec, trackTop);
            inner.appendChild(audioTrack);
            trackTop += TRACK_HEIGHT + 2;
        }

        // Subtitle track
        const subTrack = createSubtitleTrack(duration, pixelsPerSec, trackTop);
        inner.appendChild(subTrack);
        trackTop += TRACK_HEIGHT + 2;

        // ---- Playhead ----
        const playhead = document.createElement('div');
        playhead.id = 'timeline-playhead';
        playhead.style.cssText = `
            position:absolute;top:0;bottom:0;width:2px;
            background:linear-gradient(to bottom, var(--c-primary), #FF4500);
            z-index:100;pointer-events:none;
            left:${TRACK_LABEL_WIDTH + state.currentTime * pixelsPerSec}px;
            box-shadow:0 0 8px rgba(255,107,53,0.6);
        `;
        // Playhead handle
        const handle = document.createElement('div');
        handle.style.cssText = `
            position:absolute;top:-4px;left:-5px;width:12px;height:12px;
            background:var(--c-primary);border-radius:50%;cursor:ew-resize;
            box-shadow:0 0 6px rgba(255,107,53,0.8);
        `;
        playhead.appendChild(handle);
        inner.appendChild(playhead);

        // ---- Track labels ----
        const labels = [];
        let labelIndex = 0;
        if (state.videoFile) {
            labels.push({ text: 'Video', icon: '🎬', color: '#FF6B35', y: TIMELINE_HEADER_HEIGHT + TRACK_HEIGHT / 2, idx: 0 });
            labelIndex++;
        }
        if (state.waveformData) {
            const audioTrackY = TIMELINE_HEADER_HEIGHT + (state.videoFile ? TRACK_HEIGHT + 2 : 0);
            labels.push({ text: 'Audio', icon: '🎵', color: '#2EC4B6', y: audioTrackY + TRACK_HEIGHT / 2, idx: labelIndex });
            labelIndex++;
        }
        const subTrackY = TIMELINE_HEADER_HEIGHT + 
            (state.videoFile ? TRACK_HEIGHT + 2 : 0) + 
            (state.waveformData ? TRACK_HEIGHT + 2 : 0);
        labels.push({ text: 'Subtitles', icon: '📝', color: '#FFB703', y: subTrackY + TRACK_HEIGHT / 2, idx: labelIndex });

        // Track labels as styled left column
        const labelOverlay = document.createElement('div');
        labelOverlay.style.cssText = `
            position:absolute;top:0;left:0;width:${TRACK_LABEL_WIDTH}px;
            bottom:0;pointer-events:none;z-index:50;
        `;
        labels.forEach(l => {
            const label = document.createElement('div');
            label.style.cssText = `
                position:absolute;left:0;right:0;
                top:${l.y - TRACK_HEIGHT / 2}px;height:${TRACK_HEIGHT}px;
                display:flex;align-items:center;gap:6px;
                padding:0 8px;
                border-left:3px solid ${l.color};
                opacity:0.85;
            `;
            label.innerHTML = `
                <span style="font-size:0.85rem;">${l.icon}</span>
                <span style="font-size:0.72rem;font-weight:600;color:var(--c-light);letter-spacing:0.3px;">${l.text}</span>
            `;
            labelOverlay.appendChild(label);
        });
        // Ruler corner
        const rulerCorner = document.createElement('div');
        rulerCorner.style.cssText = `
            position:absolute;top:0;left:0;width:${TRACK_LABEL_WIDTH}px;height:${TIMELINE_HEADER_HEIGHT}px;
            background:linear-gradient(135deg, #1E293B, #0F172A);
            border-bottom:1px solid rgba(255,255,255,0.1);
            border-right:1px solid rgba(255,255,255,0.05);
            z-index:51;border-radius:4px 0 0 0;
            display:flex;align-items:center;justify-content:center;
        `;
        rulerCorner.innerHTML = `<span style="font-size:0.65rem;color:rgba(255,255,255,0.4);font-weight:500;letter-spacing:0.5px;">TIME</span>`;
        labelOverlay.appendChild(rulerCorner);

        inner.appendChild(labelOverlay);

        // ---- Total height ----
        inner.style.minHeight = `${trackTop + 20}px`;
        container.appendChild(inner);
    }

    // ----- Ruler -----
    function createRuler(duration, pixelsPerSec) {
        const ruler = document.createElement('div');
        ruler.style.cssText = `
            position:sticky;top:0;left:${TRACK_LABEL_WIDTH}px;
            height:${TIMELINE_HEADER_HEIGHT}px;
            background:linear-gradient(135deg, #1E293B, #0F172A);
            border-bottom:1px solid rgba(255,255,255,0.1);
            z-index:80;border-radius:4px 4px 0 0;
            margin-left:${TRACK_LABEL_WIDTH}px;
        `;

        // Determine intervals based on zoom
        let majorInterval = 5; // seconds between major ticks
        let minorCount = 5; // minor ticks per major
        
        if (state.zoom < 0.5) { majorInterval = 30; minorCount = 6; }
        else if (state.zoom < 1) { majorInterval = 10; minorCount = 5; }
        else if (state.zoom < 2) { majorInterval = 5; minorCount = 5; }
        else if (state.zoom < 4) { majorInterval = 2; minorCount = 4; }
        else if (state.zoom < 6) { majorInterval = 1; minorCount = 5; }
        else { majorInterval = 0.5; minorCount = 5; }

        const minorInterval = majorInterval / minorCount;

        for (let t = 0; t <= duration + majorInterval; t += minorInterval) {
            // Determine if major or minor
            const isMajor = Math.abs(t % majorInterval) < 0.001;
            const isMid = Math.abs(t % (majorInterval / 2)) < 0.001;
            
            const x = t * pixelsPerSec;
            
            // Skip if too dense (for minor ticks at low zoom)
            if (!isMajor && state.zoom < 1) continue;

            const marker = document.createElement('div');
            const height = isMajor ? '100%' : (isMid ? '60%' : '35%');
            const opacity = isMajor ? 0.5 : (isMid ? 0.25 : 0.12);
            marker.style.cssText = `
                position:absolute;left:${x}px;top:${isMajor ? '0' : (TIMELINE_HEADER_HEIGHT - parseInt(height) + 'px')};
                width:1px;height:${height};
                background:rgba(255,255,255,${opacity});
                pointer-events:none;
            `;
            ruler.appendChild(marker);

            if (isMajor) {
                const label = document.createElement('div');
                label.style.cssText = `
                    position:absolute;left:${x + 5}px;top:3px;
                    font-size:0.65rem;color:rgba(255,255,255,0.6);
                    font-family:'Courier New',monospace;
                    font-weight:500;letter-spacing:0.5px;
                    white-space:nowrap;pointer-events:none;
                    text-shadow:0 1px 2px rgba(0,0,0,0.5);
                `;
                label.textContent = formatTimeShort(t);
                ruler.appendChild(label);
            }
        }

        // Time scale indicator (bottom edge glow)
        const bottomGlow = document.createElement('div');
        bottomGlow.style.cssText = `
            position:absolute;bottom:0;left:0;right:0;height:1px;
            background:linear-gradient(90deg, transparent, var(--c-primary), transparent);
            opacity:0.3;
        `;
        ruler.appendChild(bottomGlow);

        return ruler;
    }

    // ----- Video Track -----
    function createVideoTrack(duration, pixelsPerSec, top) {
        const track = document.createElement('div');
        track.style.cssText = `
            position:absolute;top:${top}px;left:${TRACK_LABEL_WIDTH}px;
            height:${TRACK_HEIGHT}px;width:${duration * pixelsPerSec}px;
            background:var(--c-dark);
            border-radius:4px;overflow:hidden;
        `;

        // Draw video thumbnails using canvas
        if (state.videoFile && state.videoUrl) {
            const canvas = document.createElement('canvas');
            canvas.width = duration * pixelsPerSec;
            canvas.height = TRACK_HEIGHT;
            canvas.style.cssText = `width:100%;height:100%;`;
            track.appendChild(canvas);

            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Draw thumbnail strips
            const video = document.createElement('video');
            video.src = state.videoUrl;
            video.preload = 'metadata';

            video.addEventListener('loadeddata', () => {
                const thumbnailInterval = Math.max(1, Math.floor(duration / 20)); // ~20 thumbnails
                let count = 0;
                
                function captureThumbnail(time) {
                    if (time > duration || count > 30) return;
                    video.currentTime = time;
                    video.addEventListener('seeked', function onSeek() {
                        video.removeEventListener('seeked', onSeek);
                        const x = (time / duration) * canvas.width;
                        const w = Math.max(20, (canvas.width / duration) * thumbnailInterval);
                        
                        ctx.drawImage(video, x, 0, w, TRACK_HEIGHT);
                        count++;
                        
                        setTimeout(() => captureThumbnail(time + thumbnailInterval), 100);
                    }, { once: true });
                }
                captureThumbnail(0);
            });
        }

        return track;
    }

    // ----- Audio Track with Waveform -----
    function createAudioTrack(duration, pixelsPerSec, top) {
        const track = document.createElement('div');
        track.style.cssText = `
            position:absolute;top:${top}px;left:${TRACK_LABEL_WIDTH}px;
            height:${TRACK_HEIGHT}px;width:${duration * pixelsPerSec}px;
            background:var(--c-dark-2);
            border-radius:4px;overflow:hidden;
        `;

        // Canvas for waveform
        const canvas = document.createElement('canvas');
        canvas.width = duration * pixelsPerSec;
        canvas.height = TRACK_HEIGHT;
        canvas.style.cssText = `width:100%;height:100%;position:absolute;top:0;left:0;`;
        track.appendChild(canvas);

        const ctx = canvas.getContext('2d');

        if (state.waveformData) {
            const data = state.waveformData;
            const w = canvas.width;
            const h = canvas.height;
            const mid = h / 2;

            // Draw waveform with amplitude-based coloring
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            
            for (let i = 0; i < data.length; i++) {
                const x = (i / data.length) * w;
                const val = data[i] * mid * 0.8;
                
                // Color based on amplitude (green=quiet, yellow=medium, red=loud)
                const amp = Math.abs(val) / mid;
                let r, g, b;
                if (amp < 0.3) {
                    r = 46; g = 196; b = 182; // teal / quiet
                } else if (amp < 0.6) {
                    r = 255; g = 183; b = 3; // gold / medium
                } else {
                    r = 255; g = 107; b = 53; // orange / loud
                }
                
                ctx.strokeStyle = `rgba(${r},${g},${b},0.7)`;
                
                if (i === 0) {
                    ctx.moveTo(x, mid - val);
                } else {
                    ctx.lineTo(x, mid - val);
                }
            }
            ctx.stroke();

            // Draw bottom half
            ctx.beginPath();
            for (let i = 0; i < data.length; i++) {
                const x = (i / data.length) * w;
                const val = data[i] * mid * 0.8;
                
                const amp = Math.abs(val) / mid;
                let r, g, b;
                if (amp < 0.3) {
                    r = 46; g = 196; b = 182;
                } else if (amp < 0.6) {
                    r = 255; g = 183; b = 3;
                } else {
                    r = 255; g = 107; b = 53;
                }
                
                ctx.strokeStyle = `rgba(${r},${g},${b},0.7)`;
                
                if (i === 0) {
                    ctx.moveTo(x, mid + val);
                } else {
                    ctx.lineTo(x, mid + val);
                }
            }
            ctx.stroke();

            // Fill waveform area with gradient
            const gradient = ctx.createLinearGradient(0, 0, 0, h);
            gradient.addColorStop(0, 'rgba(46, 196, 182, 0.15)');
            gradient.addColorStop(0.3, 'rgba(255, 183, 3, 0.08)');
            gradient.addColorStop(0.5, 'rgba(255, 107, 53, 0.05)');
            gradient.addColorStop(0.7, 'rgba(255, 183, 3, 0.08)');
            gradient.addColorStop(1, 'rgba(46, 196, 182, 0.15)');
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.moveTo(0, mid);
            for (let i = 0; i < data.length; i++) {
                const x = (i / data.length) * w;
                const val = data[i] * mid * 0.8;
                ctx.lineTo(x, mid - val);
            }
            ctx.lineTo(w, mid);
            for (let i = data.length - 1; i >= 0; i--) {
                const x = (i / data.length) * w;
                const val = data[i] * mid * 0.8;
                ctx.lineTo(x, mid + val);
            }
            ctx.closePath();
            ctx.fill();
        }

        // Draw vocal segments overlay with gradient
        if (state.vocalSegments && state.vocalSegments.length > 0) {
            for (const seg of state.vocalSegments) {
                const x = (seg.start / duration) * canvas.width;
                const segW = ((seg.end - seg.start) / duration) * canvas.width;
                
                // Gradient fill
                const grad = ctx.createLinearGradient(x, 0, x + segW, 0);
                grad.addColorStop(0, 'rgba(16, 185, 129, 0.05)');
                grad.addColorStop(0.5, 'rgba(16, 185, 129, 0.2)');
                grad.addColorStop(1, 'rgba(16, 185, 129, 0.05)');
                ctx.fillStyle = grad;
                ctx.fillRect(x, 0, segW, canvas.height);
                
                // Top accent
                ctx.fillStyle = 'rgba(16, 185, 129, 0.4)';
                ctx.fillRect(x, 0, segW, 2);
                
                // Voice indicator
                ctx.fillStyle = 'rgba(16, 185, 129, 0.5)';
                ctx.font = '9px Inter, sans-serif';
                ctx.fillText('🎤', x + 4, 12);
            }
        }

        return track;
    }

    // ----- Subtitle Track -----
    function createSubtitleTrack(duration, pixelsPerSec, top) {
        const track = document.createElement('div');
        track.style.cssText = `
            position:absolute;top:${top}px;left:${TRACK_LABEL_WIDTH}px;
            height:${TRACK_HEIGHT}px;width:${duration * pixelsPerSec}px;
            background:var(--c-dark-2);
            border-radius:4px;position:relative;
        `;

        // Background
        const bg = document.createElement('div');
        bg.style.cssText = `position:absolute;top:0;left:0;right:0;bottom:0;
            background: repeating-linear-gradient(
                90deg,
                transparent,
                transparent ${pixelsPerSec}px,
                rgba(255,255,255,0.03) ${pixelsPerSec}px,
                rgba(255,255,255,0.03) ${pixelsPerSec + 1}px
            );
        `;
        track.appendChild(bg);

        // Grid lines at second intervals
        for (let t = 0; t <= duration; t++) {
            const x = t * pixelsPerSec;
            const line = document.createElement('div');
            line.style.cssText = `
                position:absolute;top:0;left:${x}px;width:1px;height:100%;
                background:rgba(255,255,255,0.05);pointer-events:none;
            `;
            track.appendChild(line);
        }

        // Subtitle blocks
        state.subtitles.forEach((sub, i) => {
            const block = createSubtitleBlock(sub, i, pixelsPerSec, duration);
            track.appendChild(block);
        });

        // Click to seek video to position
        track.addEventListener('click', (e) => {
            const rect = track.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const clickTime = x / pixelsPerSec;
            
            // Don't seek if clicking on a subtitle block
            const clickedBlock = e.target.closest('[data-index]');
            if (clickedBlock) return;
            
            // Seek video to clicked position
            const video = document.getElementById('timeline-video');
            if (video && state.videoUrl) {
                video.currentTime = Math.max(0, Math.min(duration, clickTime));
                state.currentTime = video.currentTime;
                updateTimeDisplay();
                updatePlayhead();
            }
        });

        // Double-click to add subtitle at position (with text prompt)
        track.addEventListener('dblclick', (e) => {
            const rect = track.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const clickTime = x / pixelsPerSec;
            
            // Don't add if clicking on existing block
            const clickedBlock = e.target.closest('[data-index]');
            if (clickedBlock) return;

            // Check if we're in the subtitle track (not above it)
            // by verifying the click is in the track area
            const trackTop = track.getBoundingClientRect().top;
            if (e.clientY < trackTop || e.clientY > trackTop + TRACK_HEIGHT) return;

            // Prompt for text immediately
            const text = prompt('Enter subtitle text:', '');
            if (text === null) return; // cancelled

            // Add new subtitle
            const newSub = {
                index: state.subtitles.length,
                sequence: state.subtitles.length + 1,
                start: Math.max(0, clickTime - 1.5),
                end: Math.min(duration, clickTime + 1.5),
                text: text.trim() || 'New subtitle',
                duration: 3
            };
            state.subtitles.push(newSub);
            state.selectedSubIndex = state.subtitles.length - 1;
            pushHistory();
            renderTimeline();
            updateSRTEditor();
            showToast('New subtitle block added!');
        });

        return track;
    }

    // ----- Individual Subtitle Block -----
    function createSubtitleBlock(sub, index, pixelsPerSec, duration) {
        const block = document.createElement('div');
        const left = sub.start * pixelsPerSec;
        const width = Math.max(10, (sub.end - sub.start) * pixelsPerSec);
        const isSelected = index === state.selectedSubIndex;

        block.style.cssText = `
            position:absolute;
            top:4px;
            left:${left}px;
            width:${width}px;
            height:${TRACK_HEIGHT - 8}px;
            background:${isSelected 
                ? 'linear-gradient(135deg, rgba(255,107,53,0.55), rgba(255,183,3,0.35))'
                : 'linear-gradient(135deg, rgba(46,196,182,0.35), rgba(16,185,129,0.2))'};
            border:${isSelected ? '2px solid var(--c-primary)' : '1px solid rgba(46,196,182,0.45)'};
            border-radius:6px;
            cursor:grab;
            user-select:none;
            z-index:${isSelected ? 25 : 10};
            transition:box-shadow 0.2s, border-color 0.2s, transform 0.1s;
            display:flex;flex-direction:column;
            overflow:hidden;
            box-shadow:${isSelected 
                ? '0 0 16px rgba(255,107,53,0.35), 0 2px 8px rgba(0,0,0,0.3)'
                : '0 1px 4px rgba(0,0,0,0.2)'};
        `;
        block.dataset.index = index;

        // Selection glow overlay (top accent line)
        if (isSelected) {
            const glow = document.createElement('div');
            glow.style.cssText = `
                position:absolute;top:0;left:0;right:0;height:3px;
                background:linear-gradient(90deg, var(--c-primary), var(--c-gold));
                border-radius:6px 6px 0 0;
            `;
            block.appendChild(glow);
        }

        // Resize handles
        const handles = ['left', 'right'];
        handles.forEach(side => {
            const handle = document.createElement('div');
            handle.style.cssText = `
                position:absolute;top:0;bottom:0;width:8px;
                cursor:ew-resize;z-index:15;
                ${side === 'left' ? 'left:0;' : 'right:0;'}
                background:${isSelected 
                    ? 'linear-gradient(to right, rgba(255,107,53,0.3), transparent)' 
                    : 'rgba(255,255,255,0.08)'};
                ${side === 'right' ? 'background:linear-gradient(to left, rgba(255,107,53,0.3), transparent);' : ''}
                border-radius:${side === 'left' ? '6px 0 0 6px' : '0 6px 6px 0'};
                opacity:0;transition:opacity 0.15s, background 0.2s;
            `;
            handle.className = `resize-${side}`;
            block.appendChild(handle);
        });

        // Sequence number badge
        const seqBadge = document.createElement('div');
        seqBadge.style.cssText = `
            position:absolute;top:2px;right:4px;
            font-size:0.55rem;font-weight:700;
            color:rgba(255,255,255,0.6);
            background:rgba(0,0,0,0.3);
            padding:0 4px;border-radius:3px;
            pointer-events:none;z-index:5;
        `;
        seqBadge.textContent = `#${sub.sequence}`;
        block.appendChild(seqBadge);

        // Label (time range)
        const label = document.createElement('div');
        label.style.cssText = `
            font-size:0.6rem;color:rgba(255,255,255,0.8);padding:2px 6px 0;
            white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
            font-weight:500;letter-spacing:0.3px;
        `;
        label.textContent = `${formatTimeShort(sub.start)} - ${formatTimeShort(sub.end)} · ${sub.duration.toFixed(1)}s`;
        block.appendChild(label);

        // Text preview (click to edit)
        const textPreview = document.createElement('div');
        textPreview.className = 'subtitle-text-preview';
        textPreview.style.cssText = `
            font-size:0.68rem;color:rgba(255,255,255,0.85);padding:0 6px 2px;
            white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
            flex:1;cursor:text;line-height:1.3;
        `;
        textPreview.textContent = sub.text.substring(0, 60);
        block.appendChild(textPreview);

        // ---- Events ----
        block.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('resize-left')) {
                state.isDragging = true;
                state.dragType = 'resize-left';
                state.dragSubIndex = index;
                state.dragStartX = e.clientX;
                state.dragStartTime = sub.start;
                e.stopPropagation();
            } else if (e.target.classList.contains('resize-right')) {
                state.isDragging = true;
                state.dragType = 'resize-right';
                state.dragSubIndex = index;
                state.dragStartX = e.clientX;
                state.dragStartTime = sub.end;
                e.stopPropagation();
            } else if (e.target.classList.contains('subtitle-text-preview')) {
                // Let inline editor handle this
                return;
            } else if (!state.isInlineEditing) {
                state.isDragging = true;
                state.dragType = 'move';
                state.dragSubIndex = index;
                state.dragStartX = e.clientX;
                state.dragStartTime = sub.start;
                state.selectedSubIndex = index;
                renderTimeline();
                updateSRTEditor();
            }
        });

        // Double-click on text preview to inline-edit
        textPreview.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            state.selectedSubIndex = index;
            state.isInlineEditing = true;
            
            // Replace text preview with input
            const input = document.createElement('input');
            input.type = 'text';
            input.value = sub.text;
            input.style.cssText = `
                position:absolute;top:18px;left:2px;right:2px;
                padding:2px 6px;font-size:0.7rem;
                border:2px solid var(--c-primary);
                border-radius:4px;
                background:rgba(15,23,42,0.95);
                color:white;
                outline:none;
                z-index:30;
                font-family:inherit;
                width:auto;
            `;
            input.dataset.subIndex = index;
            block.style.overflow = 'visible';
            block.style.zIndex = 50;
            block.appendChild(input);
            input.focus();
            input.select();

            const saveEdit = () => {
                const val = input.value.trim();
                if (val) {
                    state.subtitles[index].text = val;
                    state.isInlineEditing = false;
                    pushHistory();
                    renderTimeline();
                    updateSRTEditor();
                }
            };

            const cancelEdit = () => {
                state.isInlineEditing = false;
                renderTimeline();
            };

            input.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') {
                    ev.preventDefault();
                    saveEdit();
                } else if (ev.key === 'Escape') {
                    ev.preventDefault();
                    cancelEdit();
                }
                ev.stopPropagation();
            });

            input.addEventListener('blur', () => {
                // Small delay to allow click on other elements
                setTimeout(() => {
                    if (state.isInlineEditing) {
                        saveEdit();
                    }
                }, 150);
            });

            // Prevent block mousedown when clicking input
            input.addEventListener('mousedown', (ev) => ev.stopPropagation());
        });

        // Hover effect for handles
        block.addEventListener('mouseenter', () => {
            block.querySelectorAll('.resize-left, .resize-right').forEach(h => h.style.opacity = '1');
        });
        block.addEventListener('mouseleave', () => {
            if (!state.isDragging && !state.isInlineEditing) {
                block.querySelectorAll('.resize-left, .resize-right').forEach(h => h.style.opacity = '0');
            }
        });

        return block;
    }

    // =============================================
    // DRAG HANDLING
    // =============================================
    function initDragHandlers() {
        document.addEventListener('mousemove', (e) => {
            if (!state.isDragging) return;

            const pixelsPerSec = PIXELS_PER_SECOND_BASE * state.zoom;
            const dx = e.clientX - state.dragStartX;
            const dt = dx / pixelsPerSec;

            const sub = state.subtitles[state.dragSubIndex];
            if (!sub) return;

            if (state.dragType === 'move') {
                let newStart = state.dragStartTime + dt;
                let newEnd = newStart + (sub.end - sub.start);
                if (newStart < 0) { newStart = 0; newEnd = sub.end - sub.start; }
                if (newEnd > state.videoDuration) { newEnd = state.videoDuration; newStart = newEnd - (sub.end - sub.start); }
                
                // Snap to nearby vocal segments and subtitle boundaries (if enabled)
                if (state.snapEnabled) {
                    // Snap to vocal segments
                    if (state.vocalSegments.length > 0) {
                        for (const seg of state.vocalSegments) {
                            if (Math.abs(newStart - seg.start) < 0.3) { newStart = seg.start; break; }
                            if (Math.abs(newStart - seg.end) < 0.3) { newStart = seg.end; break; }
                        }
                        newEnd = newStart + (sub.end - sub.start);
                    }
                    // Snap to other subtitle boundaries
                    for (const other of state.subtitles) {
                        if (other === sub) continue;
                        if (Math.abs(newStart - other.end) < 0.3) { newStart = other.end; break; }
                        if (Math.abs(newEnd - other.start) < 0.3) { newEnd = other.start; break; }
                    }
                }

                sub.start = Math.max(0, newStart);
                sub.end = Math.min(state.videoDuration || sub.end, newEnd);
            } else if (state.dragType === 'resize-left') {
                let newStart = state.dragStartTime + dt;
                if (newStart < 0) newStart = 0;
                if (newStart < sub.end - 0.2) { // Minimum 0.2s duration
                    sub.start = newStart;
                }
            } else if (state.dragType === 'resize-right') {
                let newEnd = state.dragStartTime + dt;
                if (newEnd > (state.videoDuration || newEnd)) newEnd = state.videoDuration || newEnd;
                if (newEnd > sub.start + 0.2) {
                    sub.end = newEnd;
                }
            }

            // Update durations
            sub.duration = sub.end - sub.start;
            
            renderTimeline();
            updateSRTEditor();
        });

        document.addEventListener('mouseup', () => {
            if (state.isDragging) {
                state.isDragging = false;
                state.dragType = null;
                state.dragSubIndex = -1;
            }
        });
    }

    // =============================================
    // VIDEO PLAYER
    // =============================================
    function renderVideoPlayer() {
        const container = els.videoPlayer;
        if (!container) return;

        if (!state.videoFile) {
            container.innerHTML = `
                <div class="editor-video-empty">
                    <div class="editor-video-empty-icon">🎬</div>
                    <div class="editor-video-empty-text">Upload a video file to begin editing</div>
                    <div class="editor-video-empty-sub">MP4, WebM, AVI, MOV supported</div>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="editor-video-wrapper">
                <video id="timeline-video" class="editor-video-element" preload="metadata">
                    <source src="${state.videoUrl}" type="${state.videoFile.type}">
                </video>
                <div id="subtitle-preview-overlay" style="
                    position:absolute;bottom:85px;left:50%;transform:translateX(-50%);
                    background:rgba(0,0,0,0.75);color:white;
                    padding:8px 20px;border-radius:8px;
                    font-size:1.2rem;font-weight:500;
                    text-align:center;max-width:80%;
                    pointer-events:none;transition:opacity 0.2s;
                    opacity:0;font-family:'Inter',sans-serif;
                    backdrop-filter:blur(4px);
                    border:1px solid rgba(255,255,255,0.1);
                "></div>
                <!-- Video seek bar -->
                <div id="video-seek-bar" style="
                    position:absolute;bottom:55px;left:0;right:0;height:6px;
                    background:rgba(255,255,255,0.15);cursor:pointer;
                    z-index:10;
                ">
                    <div id="video-seek-progress" style="
                        height:100%;width:0%;
                        background:linear-gradient(90deg, var(--c-primary), var(--c-gold));
                        border-radius:0 3px 3px 0;
                        transition:width 0.1s linear;
                    "></div>
                    <div id="video-seek-thumb" style="
                        position:absolute;top:-4px;width:14px;height:14px;
                        border-radius:50%;background:var(--c-primary);
                        left:0%;margin-left:-7px;
                        box-shadow:0 0 8px rgba(255,107,53,0.6);
                        opacity:0;transition:opacity 0.2s;
                    "></div>
                </div>
                <div class="editor-video-controls">
                    <button class="editor-btn-icon" onclick="TimelineEditor.togglePlay()" title="Play/Pause (Space)">
                        <span id="play-btn-icon">▶</span>
                    </button>
                    <button class="editor-btn-icon" onclick="TimelineEditor.seekRelative(-5)" title="Back 5s">⏪</button>
                    <button class="editor-btn-icon" onclick="TimelineEditor.seekToPrevSubtitle()" title="Previous Subtitle (←)">⏮</button>
                    <button class="editor-btn-icon" onclick="TimelineEditor.seekToNextSubtitle()" title="Next Subtitle (→)">⏭</button>
                    <button class="editor-btn-icon" onclick="TimelineEditor.seekRelative(5)" title="Forward 5s">⏩</button>
                    <span class="editor-time-display" id="time-display">00:00:00:00 / 00:00:00:00</span>
                    <div class="editor-speed-control">
                        <label>Speed:</label>
                        <select id="speed-select" onchange="TimelineEditor.setPlaybackRate(this.value)">
                            <option value="0.25">0.25x</option>
                            <option value="0.5">0.5x</option>
                            <option value="1" selected>1x</option>
                            <option value="1.5">1.5x</option>
                            <option value="2">2x</option>
                        </select>
                    </div>
                    <button class="editor-btn-icon" onclick="TimelineEditor.toggleSnap()" title="Toggle Snap (click timeline edge)">
                        <span id="snap-btn-icon">🔗</span>
                    </button>
                    <span class="editor-snap-label" id="snap-label">Snap</span>
                </div>
            </div>
        `;

        // Setup video element
        const video = document.getElementById('timeline-video');
        const subtitleOverlay = document.getElementById('subtitle-preview-overlay');
        if (video) {
            video.addEventListener('timeupdate', () => {
                state.currentTime = video.currentTime;
                updateTimeDisplay();
                updatePlayhead();
                updateActiveSubtitleHighlight();
                
                // Update seek bar
                const seekProgress = document.getElementById('video-seek-progress');
                const seekThumb = document.getElementById('video-seek-thumb');
                if (seekProgress && state.videoDuration > 0) {
                    const pct = (state.currentTime / state.videoDuration) * 100;
                    seekProgress.style.width = pct + '%';
                    if (seekThumb) seekThumb.style.left = pct + '%';
                }
                
                // Show current subtitle text as overlay
                if (subtitleOverlay && state.subtitles.length > 0) {
                    const activeSub = state.subtitles.find(s => 
                        state.currentTime >= s.start && state.currentTime <= s.end
                    );
                    if (activeSub) {
                        subtitleOverlay.textContent = activeSub.text;
                        subtitleOverlay.style.opacity = '1';
                    } else {
                        subtitleOverlay.style.opacity = '0';
                    }
                }
            });

            // Seek bar click handler
            const seekBar = document.getElementById('video-seek-bar');
            const seekThumbEl = document.getElementById('video-seek-thumb');
            if (seekBar) {
                // Show thumb on hover
                seekBar.addEventListener('mouseenter', () => {
                    if (seekThumbEl) seekThumbEl.style.opacity = '1';
                });
                seekBar.addEventListener('mouseleave', () => {
                    if (seekThumbEl) seekThumbEl.style.opacity = '0';
                });
                
                seekBar.addEventListener('click', (e) => {
                    const rect = seekBar.getBoundingClientRect();
                    const pct = (e.clientX - rect.left) / rect.width;
                    const seekTime = pct * state.videoDuration;
                    if (video && state.videoUrl) {
                        video.currentTime = Math.max(0, Math.min(state.videoDuration, seekTime));
                        state.currentTime = video.currentTime;
                        updateTimeDisplay();
                        updatePlayhead();
                    }
                });
            }

            video.addEventListener('play', () => {
                state.isPlaying = true;
                document.getElementById('play-btn-icon').textContent = '⏸';
            });

            video.addEventListener('pause', () => {
                state.isPlaying = false;
                document.getElementById('play-btn-icon').textContent = '▶';
            });

            video.addEventListener('loadedmetadata', () => {
                state.videoDuration = video.duration;
                updateTimeDisplay();
                renderTimeline();
            });

            video.addEventListener('click', () => {
                if (state.isPlaying) pause();
                else play();
            });
        }

        updateTimeDisplay();
    }

    // =============================================
    // PLAYBACK CONTROLS
    // =============================================
    function play() {
        const video = document.getElementById('timeline-video');
        if (video && state.videoUrl) {
            video.play();
            state.isPlaying = true;
        }
    }

    function pause() {
        const video = document.getElementById('timeline-video');
        if (video) {
            video.pause();
            state.isPlaying = false;
        }
    }

    function togglePlay() {
        if (state.isPlaying) pause();
        else play();
    }

    function seekRelative(seconds) {
        const video = document.getElementById('timeline-video');
        if (video) {
            const newTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
            video.currentTime = newTime;
            state.currentTime = newTime;
            updateTimeDisplay();
            updatePlayhead();
        }
    }

    function seekToPrevSubtitle() {
        const video = document.getElementById('timeline-video');
        if (!video || state.subtitles.length === 0) return;
        const currentTime = video.currentTime;
        let prevSub = null;
        for (const sub of state.subtitles) {
            if (sub.end < currentTime - 0.1) {
                prevSub = sub;
            } else {
                break;
            }
        }
        if (prevSub) {
            video.currentTime = prevSub.start;
            state.currentTime = prevSub.start;
            state.selectedSubIndex = state.subtitles.indexOf(prevSub);
            renderTimeline();
            updateSRTEditor();
            updateTimeDisplay();
            updatePlayhead();
        } else {
            // If no previous subtitle, go to start of first
            video.currentTime = state.subtitles[0].start;
            state.currentTime = state.subtitles[0].start;
            state.selectedSubIndex = 0;
            renderTimeline();
            updateSRTEditor();
            updateTimeDisplay();
            updatePlayhead();
        }
    }

    function seekToNextSubtitle() {
        const video = document.getElementById('timeline-video');
        if (!video || state.subtitles.length === 0) return;
        const currentTime = video.currentTime;
        let nextSub = null;
        for (const sub of state.subtitles) {
            if (sub.start > currentTime + 0.1) {
                nextSub = sub;
                break;
            }
        }
        if (nextSub) {
            video.currentTime = nextSub.start;
            state.currentTime = nextSub.start;
            state.selectedSubIndex = state.subtitles.indexOf(nextSub);
            renderTimeline();
            updateSRTEditor();
            updateTimeDisplay();
            updatePlayhead();
        }
    }

    function setPlaybackRate(rate) {
        const video = document.getElementById('timeline-video');
        if (video) {
            video.playbackRate = parseFloat(rate);
            state.playbackRate = parseFloat(rate);
        }
    }

    function toggleSnap() {
        state.snapEnabled = !state.snapEnabled;
        const btn = document.getElementById('snap-btn-icon');
        const label = document.getElementById('snap-label');
        if (btn) {
            btn.textContent = state.snapEnabled ? '🔗' : '⛓️‍💥';
            btn.style.opacity = state.snapEnabled ? '1' : '0.5';
        }
        if (label) label.style.opacity = state.snapEnabled ? '1' : '0.5';
    }

    function updateTimeDisplay() {
        const el = document.getElementById('time-display');
        if (!el) return;
        const current = formatTime(state.currentTime);
        const total = formatTime(state.videoDuration || 0);
        el.textContent = `${current} / ${total}`;
    }

    function updatePlayhead() {
        const playhead = document.getElementById('timeline-playhead');
        if (!playhead) return;
        const pixelsPerSec = PIXELS_PER_SECOND_BASE * state.zoom;
        playhead.style.left = `${120 + state.currentTime * pixelsPerSec}px`;
    }

    // Lightweight active subtitle highlight (no full re-render)
    function updateActiveSubtitleHighlight() {
        const blocks = document.querySelectorAll('[data-index]');
        let activeIndex = -1;
        const now = state.currentTime;
        for (let i = 0; i < state.subtitles.length; i++) {
            const s = state.subtitles[i];
            if (now >= s.start && now <= s.end) {
                activeIndex = i;
                break;
            }
        }
        blocks.forEach(el => {
            const idx = parseInt(el.dataset.index);
            if (idx === activeIndex) {
                el.style.boxShadow = '0 0 20px rgba(46,196,182,0.5), 0 2px 8px rgba(0,0,0,0.3)';
                el.style.borderColor = 'rgba(46,196,182,0.8)';
                el.style.zIndex = '22';
            } else if (idx === state.selectedSubIndex) {
                el.style.boxShadow = '0 0 16px rgba(255,107,53,0.35), 0 2px 8px rgba(0,0,0,0.3)';
                el.style.borderColor = 'var(--c-primary)';
                el.style.zIndex = '25';
            } else {
                el.style.boxShadow = '0 1px 4px rgba(0,0,0,0.2)';
                el.style.borderColor = 'rgba(46,196,182,0.45)';
                el.style.zIndex = '10';
            }
        });
    }

    // =============================================
    // ZOOM CONTROLS
    // =============================================
    function zoomIn() {
        state.zoom = Math.min(MAX_ZOOM, state.zoom * 1.5);
        renderTimeline();
    }

    function zoomOut() {
        state.zoom = Math.max(MIN_ZOOM, state.zoom / 1.5);
        renderTimeline();
    }

    function zoomReset() {
        state.zoom = 1;
        renderTimeline();
    }

    // =============================================
    // UNDO / REDO (simple history)
    // =============================================
    let history = [];
    let historyIndex = -1;

    function pushHistory() {
        history = history.slice(0, historyIndex + 1);
        history.push(JSON.parse(JSON.stringify(state.subtitles)));
        historyIndex = history.length - 1;
        if (history.length > 50) {
            history.shift();
            historyIndex--;
        }
    }

    function undo() {
        if (historyIndex > 0) {
            historyIndex--;
            state.subtitles = JSON.parse(JSON.stringify(history[historyIndex]));
            renderTimeline();
            updateSRTEditor();
        }
    }

    function redo() {
        if (historyIndex < history.length - 1) {
            historyIndex++;
            state.subtitles = JSON.parse(JSON.stringify(history[historyIndex]));
            renderTimeline();
            updateSRTEditor();
        }
    }

    // =============================================
    // SRT TEXT EDITOR SYNC
    // =============================================
    function updateSRTEditor() {
        const editor = document.getElementById('timeline-srt-editor');
        if (editor) {
            const srt = generateSRT(state.subtitles);
            editor.value = srt;
        }

        // Update block counters in header
        const countEl = document.getElementById('subtitle-count');
        if (countEl) countEl.textContent = state.subtitles.length;
    }

    function loadSRTFromEditor() {
        const editor = document.getElementById('timeline-srt-editor');
        if (!editor || !editor.value.trim()) return;
        try {
            const parsed = parseSRT(editor.value);
            if (parsed.length > 0) {
                state.subtitles = parsed;
                pushHistory();
                renderTimeline();
                showToast(`Loaded ${parsed.length} subtitles from editor.`);
            }
        } catch (e) {
            showToast('Error parsing SRT content. Please check the format.', true);
        }
    }

    // =============================================
    // EXPORT FUNCTIONS
    // =============================================
    function exportSRT() {
        const srt = generateSRT(state.subtitles);
        if (!srt) {
            showToast('No subtitles to export.', true);
            return;
        }

        const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'subtitles.srt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('SRT file exported successfully!');
    }

    function exportVideo() {
        if (!state.videoFile || state.subtitles.length === 0) {
            showToast('Please load a video and subtitles first.', true);
            return;
        }

        // Use Canvas API to render video with subtitles
        const video = document.getElementById('timeline-video');
        if (!video) return;

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        const ctx = canvas.getContext('2d');

        // Create a MediaRecorder to capture
        const stream = canvas.captureStream(30);
        const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
        const chunks = [];

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'subtitled-video.webm';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast('Video with burned-in subtitles exported!');
        };

        mediaRecorder.start();

        // Render frames
        const originalTime = video.currentTime;
        video.currentTime = 0;
        const fps = 30;
        const totalFrames = Math.floor(video.duration * fps);
        let frame = 0;

        function renderFrame() {
            if (frame >= totalFrames || video.ended) {
                video.pause();
                mediaRecorder.stop();
                video.currentTime = originalTime;
                return;
            }

            const time = frame / fps;
            video.currentTime = time;

            // Wait for seek
            video.addEventListener('seeked', function onSeek() {
                video.removeEventListener('seeked', onSeek);
                
                // Draw video frame
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                // Draw subtitles
                const activeSub = state.subtitles.find(s => time >= s.start && time <= s.end);
                if (activeSub) {
                    ctx.fillStyle = 'rgba(0,0,0,0.7)';
                    const textW = ctx.measureText(activeSub.text).width + 40;
                    const textH = 50;
                    const x = (canvas.width - textW) / 2;
                    const y = canvas.height - textH - 20;
                    roundRect(ctx, x, y, textW, textH, 10);
                    ctx.fill();

                    ctx.fillStyle = 'white';
                    ctx.font = '20px Inter, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(activeSub.text, canvas.width / 2, y + textH / 2);
                }

                frame++;
                setTimeout(renderFrame, 1000 / fps / 4); // Faster than real-time
            }, { once: true });
        }

        renderFrame();
    }

    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    // =============================================
    // VOCAL AUTO-SYNC
    // =============================================
    function autoSyncFromVocals() {
        if (!state.vocalSegments || state.vocalSegments.length === 0) {
            showToast('No vocal segments detected. Please load a video with audio first.', true);
            return;
        }

        // Create subtitles from vocal segments
        const newSubtitles = state.vocalSegments.map((seg, i) => ({
            index: i,
            sequence: i + 1,
            start: seg.start,
            end: seg.end,
            text: `[Auto-detected speech segment ${i + 1}]`,
            duration: seg.end - seg.start
        }));

        if (newSubtitles.length > 0) {
            state.subtitles = newSubtitles;
            pushHistory();
            renderTimeline();
            updateSRTEditor();
            showToast(`Auto-synced ${newSubtitles.length} subtitle blocks from vocal detection!`);
        }
    }

    // =============================================
    // FILE LOADING
    // =============================================
    async function loadVideoFile(file) {
        try {
            // Revoke old URL
            if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);

            state.videoFile = file;
            state.videoUrl = URL.createObjectURL(file);

            // Analyze audio
            try {
                const arrayBuffer = await file.arrayBuffer();
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
                await analyzeAudio(audioBuffer);
                showToast('Audio analyzed! Vocal segments detected.');
            } catch (audioErr) {
                console.warn('Audio analysis skipped:', audioErr);
                state.waveformData = null;
                state.vocalSegments = [];
            }

            renderVideoPlayer();
            renderTimeline();
            updateSRTEditor();

            // Try to extract embedded subtitles
            try {
                const extracted = await extractSubtitlesFromVideo(file);
                if (extracted && extracted.length > 0) {
                    state.subtitles = extracted.map((s, i) => ({
                        index: i,
                        sequence: i + 1,
                        start: s.start,
                        end: s.end,
                        text: s.text,
                        duration: s.end - s.start
                    }));
                    pushHistory();
                    renderTimeline();
                    updateSRTEditor();
                    showToast(`Extracted ${extracted.length} subtitles from video!`);
                }
            } catch (extractErr) {
                console.warn('Subtitle extraction skipped:', extractErr);
            }

        } catch (err) {
            showToast('Error loading video: ' + err.message, true);
        }
    }

    function loadSRTFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const parsed = parseSRT(e.target.result);
                if (parsed.length > 0) {
                    state.subtitles = parsed;
                    pushHistory();
                    renderTimeline();
                    updateSRTEditor();
                    showToast(`Loaded ${parsed.length} subtitles!`);
                } else {
                    showToast('No valid subtitles found in file.', true);
                }
            } catch (err) {
                showToast('Error parsing SRT: ' + err.message, true);
            }
        };
        reader.readAsText(file);
    }

    // =============================================
    // SUBTITLE BULK OPERATIONS
    // =============================================
    function deleteSelectedSubtitle() {
        if (state.selectedSubIndex < 0 || state.selectedSubIndex >= state.subtitles.length) {
            showToast('No subtitle selected. Click a block first.', true);
            return;
        }
        state.subtitles.splice(state.selectedSubIndex, 1);
        state.subtitles.forEach((s, i) => { s.index = i; s.sequence = i + 1; });
        state.selectedSubIndex = -1;
        pushHistory();
        renderTimeline();
        updateSRTEditor();
        showToast('Subtitle deleted.');
    }

    function splitSubtitle() {
        if (state.selectedSubIndex < 0) {
            showToast('Select a subtitle block first.', true);
            return;
        }
        const sub = state.subtitles[state.selectedSubIndex];
        const mid = (sub.start + sub.end) / 2;
        const newSub = {
            index: state.subtitles.length,
            sequence: state.subtitles.length + 1,
            start: mid,
            end: sub.end,
            text: sub.text + ' (cont.)',
            duration: sub.end - mid
        };
        sub.end = mid;
        sub.duration = sub.end - sub.start;
        state.subtitles.splice(state.selectedSubIndex + 1, 0, newSub);
        state.subtitles.forEach((s, i) => { s.index = i; s.sequence = i + 1; });
        pushHistory();
        renderTimeline();
        updateSRTEditor();
        showToast('Subtitle split at midpoint.');
    }

    function mergeNextSubtitle() {
        if (state.selectedSubIndex < 0 || state.selectedSubIndex >= state.subtitles.length - 1) {
            showToast('Select a subtitle that has a next one to merge with.', true);
            return;
        }
        const current = state.subtitles[state.selectedSubIndex];
        const next = state.subtitles[state.selectedSubIndex + 1];
        current.end = next.end;
        current.text = current.text + ' ' + next.text;
        current.duration = current.end - current.start;
        state.subtitles.splice(state.selectedSubIndex + 1, 1);
        state.subtitles.forEach((s, i) => { s.index = i; s.sequence = i + 1; });
        pushHistory();
        renderTimeline();
        updateSRTEditor();
        showToast('Subtitles merged.');
    }

    function clearAllSubtitles() {
        if (state.subtitles.length === 0) return;
        if (!confirm('Delete all subtitles?')) return;
        state.subtitles = [];
        state.selectedSubIndex = -1;
        pushHistory();
        renderTimeline();
        updateSRTEditor();
        showToast('All subtitles cleared.');
    }

    // =============================================
    // TOAST NOTIFICATIONS
    // =============================================
    function showToast(message, isError = false) {
        const container = document.getElementById('editor-toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.style.cssText = `
            padding:10px 16px;border-radius:6px;font-size:0.85rem;font-weight:500;
            ${isError 
                ? 'background:#FEF2F2;color:#991B1B;border:1px solid #FECACA;' 
                : 'background:#ECFDF5;color:#065F46;border:1px solid #A7F3D0;'
            }
            margin-bottom:6px;animation:slideIn 0.25s ease;
            box-shadow:0 2px 8px rgba(0,0,0,0.1);
            max-width:400px;
        `;
        toast.textContent = isError ? '⚠️ ' + message : '✅ ' + message;

        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // =============================================
    // SUBTITLE SELECTION FROM TIMELINE CLICK
    // =============================================
    function selectSubtitleAtTime(time) {
        const found = state.subtitles.find(s => time >= s.start && time <= s.end);
        if (found !== undefined) {
            state.selectedSubIndex = state.subtitles.indexOf(found);
            renderTimeline();
            updateSRTEditor();
        }
    }

    // =============================================
    // ZOOM DISPLAY
    // =============================================
    function updateZoomDisplay() {
        const el = document.getElementById('zoom-display');
        if (el) el.textContent = `${Math.round(state.zoom * 100)}%`;
    }

    // =============================================
    // KEYBOARD SHORTCUTS
    // =============================================
    function initKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Don't handle shortcuts when editing inline
            if (state.isInlineEditing) return;
            
            const target = e.target;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

            switch (e.key.toLowerCase()) {
                case ' ':
                    e.preventDefault();
                    togglePlay();
                    break;
                case 'delete':
                case 'backspace':
                    if (state.selectedSubIndex >= 0) {
                        e.preventDefault();
                        deleteSelectedSubtitle();
                    }
                    break;
                case 'z':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        if (e.shiftKey) {
                            redo();
                        } else {
                            undo();
                        }
                    }
                    break;
                case 'y':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        redo();
                    }
                    break;
                case 'arrowleft':
                    if (e.shiftKey) {
                        e.preventDefault();
                        seekRelative(-0.04);
                    } else {
                        e.preventDefault();
                        if (state.selectedSubIndex > 0) {
                            state.selectedSubIndex--;
                            renderTimeline();
                            updateSRTEditor();
                        }
                    }
                    break;
                case 'arrowright':
                    if (e.shiftKey) {
                        e.preventDefault();
                        seekRelative(0.04);
                    } else {
                        e.preventDefault();
                        if (state.selectedSubIndex < state.subtitles.length - 1) {
                            state.selectedSubIndex++;
                            renderTimeline();
                            updateSRTEditor();
                        }
                    }
                    break;
                case 's':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        exportSRT();
                    }
                    break;
            }
        });
    }

    // =============================================
    // INITIALIZATION
    // =============================================
    function init(containerId) {
        // Store DOM refs
        const container = document.getElementById(containerId || 'editor-tab');
        if (!container) return;

        els.timelineContainer = document.getElementById('timeline-editor-container');
        els.videoPlayer = document.getElementById('editor-video-player');
        els.subtitleTrack = document.getElementById('subtitle-track');

        // Restore existing subtitles if any were loaded earlier
        const existingSRT = document.getElementById('srt-editor')?.textContent;
        if (existingSRT && existingSRT.trim()) {
            const parsed = parseSRT(existingSRT);
            if (parsed.length > 0) {
                state.subtitles = parsed;
                pushHistory();
            }
        }

        // Init drag handlers
        initDragHandlers();

        // Init keyboard shortcuts
        initKeyboardShortcuts();

        // Auto-resize timeline on window resize
        window.addEventListener('resize', () => {
            renderTimeline();
        });

        // Initial render
        renderVideoPlayer();
        renderTimeline();
        updateSRTEditor();
        updateZoomDisplay();
    }

    // =============================================
    // PUBLIC API
    // =============================================
    return {
        init,
        loadVideoFile,
        loadSRTFile,
        exportSRT,
        exportVideo,
        togglePlay,
        play,
        pause,
        seekRelative,
        setPlaybackRate,
        toggleSnap,
        zoomIn,
        zoomOut,
        zoomReset,
        autoSyncFromVocals,
        deleteSelectedSubtitle,
        splitSubtitle,
        mergeNextSubtitle,
        clearAllSubtitles,
        loadSRTFromEditor,
        selectSubtitleAtTime,
        seekToPrevSubtitle,
        seekToNextSubtitle,
        undo,
        redo,
        generateSRT,
        parseSRT,
        getState: () => state,
        formatTime
    };
})();
