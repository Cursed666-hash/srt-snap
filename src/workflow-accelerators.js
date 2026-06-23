/* =============================================
   SRT Snap — Workflow Accelerators
   Premium features for professional video editors

   1. Short-Form Micro-Chunker (Shorts/Reels optimizer)
   2. Auto-Emoji & Word Highlighting Injector
   3. NLE Native Bridge Exporters (EDL, XML, CSV)
   4. SRT-to-Brand-Kit (Social media copy generator)
   ============================================= */

const WorkflowAccelerators = (() => {
    'use strict';

    // =============================================
    // 1. SHORT-FORM MICRO-CHUNKER
    //    Splits long SRT lines into 1-3 word micro-blocks
    //    with proportionally recalculated timestamps.
    //    Perfect for TikTok, Reels, Shorts.
    // =============================================
    function microChunkSRT(subtitles) {
        if (!subtitles || subtitles.length === 0) return [];

        const result = [];
        let seq = 1;

        for (const sub of subtitles) {
            const text = sub.text.trim();
            if (!text) continue;

            const words = text.split(/\s+/).filter(w => w.length > 0);
            if (words.length === 0) continue;

            const originalStart = sub.start;
            const originalEnd = sub.end;
            const originalDuration = originalEnd - originalStart;

            // Group words into micro-chunks of 1-3 words
            const chunks = [];
            let i = 0;
            while (i < words.length) {
                // Aim for chunks of 1-3 words based on word count
                const remaining = words.length - i;
                let chunkSize;
                if (remaining <= 3) {
                    chunkSize = remaining;
                } else if (remaining <= 5) {
                    chunkSize = Math.ceil(remaining / 2);
                } else {
                    // Distribute: prefer 2-3 word chunks
                    chunkSize = Math.min(3, 1 + Math.floor(Math.random() * 2));
                    // Adjust so we don't leave 1 word at the end
                    if (remaining - chunkSize === 1) chunkSize++;
                }
                chunks.push(words.slice(i, i + chunkSize).join(' '));
                i += chunkSize;
            }

            if (chunks.length === 0) continue;

            // Distribute time proportionally across chunks
            // Calculate approximate reading time per chunk based on word count
            const totalWords = words.length;
            let wordIndex = 0;

            for (let c = 0; c < chunks.length; c++) {
                const chunkWords = chunks[c].split(/\s+/).length;
                // Calculate start/end based on proportion of words
                const chunkStartRatio = wordIndex / totalWords;
                const chunkEndRatio = (wordIndex + chunkWords) / totalWords;
                
                const chunkStart = originalStart + chunkStartRatio * originalDuration;
                const chunkEnd = originalStart + chunkEndRatio * originalDuration;

                // Ensure minimum display time of 0.3s per chunk
                let adjustedStart = chunkStart;
                let adjustedEnd = chunkEnd;
                if (adjustedEnd - adjustedStart < 0.3) {
                    adjustedEnd = adjustedStart + 0.3;
                }

                result.push({
                    index: result.length,
                    sequence: seq++,
                    start: Math.round(adjustedStart * 1000) / 1000,
                    end: Math.round(adjustedEnd * 1000) / 1000,
                    text: chunks[c],
                    duration: Math.round((adjustedEnd - adjustedStart) * 1000) / 1000
                });

                wordIndex += chunkWords;
            }
        }

        return result;
    }

    // =============================================
    // 2. AUTO-EMOJI & WORD HIGHLIGHTING INJECTOR
    //    Scans SRT text against a dictionary of "power
    //    words" and automatically capitalizes them and
    //    appends matching emojis. All local, no API calls.
    // =============================================

    // Power word dictionary: word -> { highlight: string, emoji: string }
    const POWER_WORD_DICT = {
        // Money & Finance
        'money': { highlight: 'MONEY', emoji: '💰' },
        'cash': { highlight: 'CASH', emoji: '💵' },
        'rich': { highlight: 'RICH', emoji: '🤑' },
        'wealth': { highlight: 'WEALTH', emoji: '💎' },
        'profit': { highlight: 'PROFIT', emoji: '📈' },
        'invest': { highlight: 'INVEST', emoji: '📊' },
        'investing': { highlight: 'INVESTING', emoji: '📊' },
        'million': { highlight: 'MILLION', emoji: '🤑' },
        'billion': { highlight: 'BILLION', emoji: '🤑' },
        'expensive': { highlight: 'EXPENSIVE', emoji: '💸' },
        'cheap': { highlight: 'CHEAP', emoji: '🏷️' },
        'free': { highlight: 'FREE', emoji: '🎁' },
        'price': { highlight: 'PRICE', emoji: '🏷️' },
        'deal': { highlight: 'DEAL', emoji: '🤝' },
        'save': { highlight: 'SAVE', emoji: '💰' },
        'sale': { highlight: 'SALE', emoji: '🏷️' },

        // Danger / Urgency
        'danger': { highlight: 'DANGER', emoji: '🚨' },
        'warning': { highlight: 'WARNING', emoji: '⚠️' },
        'urgent': { highlight: 'URGENT', emoji: '🔴' },
        'emergency': { highlight: 'EMERGENCY', emoji: '🚨' },
        'stop': { highlight: 'STOP', emoji: '🛑' },
        'caution': { highlight: 'CAUTION', emoji: '⚠️' },
        'important': { highlight: 'IMPORTANT', emoji: '❗' },
        'critical': { highlight: 'CRITICAL', emoji: '🔴' },
        'deadly': { highlight: 'DEADLY', emoji: '☠️' },
        'toxic': { highlight: 'TOXIC', emoji: '☣️' },
        'risk': { highlight: 'RISK', emoji: '🎲' },
        'alarm': { highlight: 'ALARM', emoji: '🔔' },
        'hurry': { highlight: 'HURRY', emoji: '⏰' },
        'last chance': { highlight: 'LAST CHANCE', emoji: '⏳' },
        'limited': { highlight: 'LIMITED', emoji: '⏳' },
        'deadline': { highlight: 'DEADLINE', emoji: '⏰' },

        // Emotion / Impact
        'love': { highlight: 'LOVE', emoji: '❤️' },
        'hate': { highlight: 'HATE', emoji: '💔' },
        'crazy': { highlight: 'CRAZY', emoji: '🤪' },
        'amazing': { highlight: 'AMAZING', emoji: '😍' },
        'incredible': { highlight: 'INCREDIBLE', emoji: '🤯' },
        'unbelievable': { highlight: 'UNBELIEVABLE', emoji: '😱' },
        'wow': { highlight: 'WOW', emoji: '😮' },
        'mind blown': { highlight: 'MIND BLOWN', emoji: '🤯' },
        'shock': { highlight: 'SHOCK', emoji: '😲' },
        'shocking': { highlight: 'SHOCKING', emoji: '😲' },
        'insane': { highlight: 'INSANE', emoji: '🤯' },
        'epic': { highlight: 'EPIC', emoji: '🔥' },
        'legendary': { highlight: 'LEGENDARY', emoji: '🏆' },
        'awesome': { highlight: 'AWESOME', emoji: '🔥' },
        'brilliant': { highlight: 'BRILLIANT', emoji: '💡' },
        'genius': { highlight: 'GENIUS', emoji: '🧠' },
        'terrible': { highlight: 'TERRIBLE', emoji: '💀' },
        'horrible': { highlight: 'HORRIBLE', emoji: '😱' },
        'beautiful': { highlight: 'BEAUTIFUL', emoji: '✨' },
        'perfect': { highlight: 'PERFECT', emoji: '✨' },
        'sorry': { highlight: 'SORRY', emoji: '😔' },
        'please': { highlight: 'PLEASE', emoji: '🙏' },
        'thank you': { highlight: 'THANK YOU', emoji: '🙏' },
        'thanks': { highlight: 'THANKS', emoji: '🙏' },
        'congratulations': { highlight: 'CONGRATULATIONS', emoji: '🎉' },
        'congrats': { highlight: 'CONGRATS', emoji: '🎉' },

        // Success / Achievement
        'winner': { highlight: 'WINNER', emoji: '🏆' },
        'win': { highlight: 'WIN', emoji: '🏆' },
        'winning': { highlight: 'WINNING', emoji: '🏆' },
        'success': { highlight: 'SUCCESS', emoji: '✅' },
        'successful': { highlight: 'SUCCESSFUL', emoji: '✅' },
        'victory': { highlight: 'VICTORY', emoji: '✌️' },
        'champion': { highlight: 'CHAMPION', emoji: '🥇' },
        'number one': { highlight: 'NUMBER ONE', emoji: '🥇' },
        '#1': { highlight: '#1', emoji: '🥇' },
        'goal': { highlight: 'GOAL', emoji: '🎯' },
        'achievement': { highlight: 'ACHIEVEMENT', emoji: '🏅' },
        'complete': { highlight: 'COMPLETE', emoji: '✅' },
        'done': { highlight: 'DONE', emoji: '✅' },
        'master': { highlight: 'MASTER', emoji: '🎓' },
        'expert': { highlight: 'EXPERT', emoji: '🎓' },
        'pro': { highlight: 'PRO', emoji: '⚡' },
        'professional': { highlight: 'PROFESSIONAL', emoji: '💼' },

        // Time / Speed
        'fast': { highlight: 'FAST', emoji: '⚡' },
        'quick': { highlight: 'QUICK', emoji: '⚡' },
        'rapid': { highlight: 'RAPID', emoji: '🚀' },
        'speed': { highlight: 'SPEED', emoji: '🏎️' },
        'instant': { highlight: 'INSTANT', emoji: '⚡' },
        'immediate': { highlight: 'IMMEDIATE', emoji: '⏱️' },
        'now': { highlight: 'NOW', emoji: '⏰' },
        'today': { highlight: 'TODAY', emoji: '📅' },
        'tomorrow': { highlight: 'TOMORROW', emoji: '📅' },
        'never': { highlight: 'NEVER', emoji: '🚫' },
        'always': { highlight: 'ALWAYS', emoji: '♾️' },
        'forever': { highlight: 'FOREVER', emoji: '♾️' },
        'late': { highlight: 'LATE', emoji: '⏰' },
        'early': { highlight: 'EARLY', emoji: '🌅' },
        'morning': { highlight: 'MORNING', emoji: '☀️' },
        'night': { highlight: 'NIGHT', emoji: '🌙' },

        // Growth / Change
        'grow': { highlight: 'GROW', emoji: '🌱' },
        'growth': { highlight: 'GROWTH', emoji: '📈' },
        'increase': { highlight: 'INCREASE', emoji: '📈' },
        'boost': { highlight: 'BOOST', emoji: '🚀' },
        'improve': { highlight: 'IMPROVE', emoji: '📈' },
        'improvement': { highlight: 'IMPROVEMENT', emoji: '📈' },
        'upgrade': { highlight: 'UPGRADE', emoji: '⬆️' },
        'transform': { highlight: 'TRANSFORM', emoji: '🔄' },
        'transformation': { highlight: 'TRANSFORMATION', emoji: '🔄' },
        'change': { highlight: 'CHANGE', emoji: '🔄' },
        'evolve': { highlight: 'EVOLVE', emoji: '🧬' },
        'develop': { highlight: 'DEVELOP', emoji: '📈' },
        'progress': { highlight: 'PROGRESS', emoji: '📈' },
        'advance': { highlight: 'ADVANCE', emoji: '🚀' },
        'new': { highlight: 'NEW', emoji: '🆕' },
        'fresh': { highlight: 'FRESH', emoji: '✨' },
        'future': { highlight: 'FUTURE', emoji: '🔮' },
        'next level': { highlight: 'NEXT LEVEL', emoji: '📈' },

        // Discovery / Learning
        'secret': { highlight: 'SECRET', emoji: '🤫' },
        'hidden': { highlight: 'HIDDEN', emoji: '👀' },
        'reveal': { highlight: 'REVEAL', emoji: '🔍' },
        'discover': { highlight: 'DISCOVER', emoji: '🔍' },
        'learn': { highlight: 'LEARN', emoji: '📚' },
        'tutorial': { highlight: 'TUTORIAL', emoji: '📖' },
        'guide': { highlight: 'GUIDE', emoji: '📖' },
        'tips': { highlight: 'TIPS', emoji: '💡' },
        'hack': { highlight: 'HACK', emoji: '🔧' },
        'trick': { highlight: 'TRICK', emoji: '🎩' },
        'strategy': { highlight: 'STRATEGY', emoji: '🧠' },
        'method': { highlight: 'METHOD', emoji: '📋' },
        'technique': { highlight: 'TECHNIQUE', emoji: '🔧' },
        'know': { highlight: 'KNOW', emoji: '💡' },
        'understand': { highlight: 'UNDERSTAND', emoji: '🧠' },
        'explain': { highlight: 'EXPLAIN', emoji: '📝' },
        'answer': { highlight: 'ANSWER', emoji: '✅' },
        'question': { highlight: 'QUESTION', emoji: '❓' },
        'why': { highlight: 'WHY', emoji: '🤔' },
        'how': { highlight: 'HOW', emoji: '🔍' },
        'what': { highlight: 'WHAT', emoji: '❓' },

        // Social / Viral
        'viral': { highlight: 'VIRAL', emoji: '📱' },
        'trending': { highlight: 'TRENDING', emoji: '🔥' },
        'trend': { highlight: 'TREND', emoji: '📈' },
        'popular': { highlight: 'POPULAR', emoji: '🔥' },
        'share': { highlight: 'SHARE', emoji: '🔄' },
        'subscribe': { highlight: 'SUBSCRIBE', emoji: '🔔' },
        'follow': { highlight: 'FOLLOW', emoji: '👤' },
        'like': { highlight: 'LIKE', emoji: '👍' },
        'comment': { highlight: 'COMMENT', emoji: '💬' },
        'mention': { highlight: 'MENTION', emoji: '📢' },
        'tag': { highlight: 'TAG', emoji: '🏷️' },
        'friend': { highlight: 'FRIEND', emoji: '👫' },
        'family': { highlight: 'FAMILY', emoji: '👨‍👩‍👧‍👦' },

        // Food & Drink
        'food': { highlight: 'FOOD', emoji: '🍽️' },
        'delicious': { highlight: 'DELICIOUS', emoji: '😋' },
        'hungry': { highlight: 'HUNGRY', emoji: '🍔' },
        'thirsty': { highlight: 'THIRSTY', emoji: '🥤' },
        'coffee': { highlight: 'COFFEE', emoji: '☕' },
        'tea': { highlight: 'TEA', emoji: '🫖' },
        'pizza': { highlight: 'PIZZA', emoji: '🍕' },
        'burger': { highlight: 'BURGER', emoji: '🍔' },
        'cake': { highlight: 'CAKE', emoji: '🎂' },
        'chocolate': { highlight: 'CHOCOLATE', emoji: '🍫' },

        // Travel & Places
        'travel': { highlight: 'TRAVEL', emoji: '✈️' },
        'vacation': { highlight: 'VACATION', emoji: '🏖️' },
        'holiday': { highlight: 'HOLIDAY', emoji: '🎉' },
        'adventure': { highlight: 'ADVENTURE', emoji: '🗺️' },
        'journey': { highlight: 'JOURNEY', emoji: '🚀' },
        'explore': { highlight: 'EXPLORE', emoji: '🌍' },
        'home': { highlight: 'HOME', emoji: '🏠' },
        'world': { highlight: 'WORLD', emoji: '🌍' },
        'global': { highlight: 'GLOBAL', emoji: '🌐' },

        // Technology
        'tech': { highlight: 'TECH', emoji: '💻' },
        'technology': { highlight: 'TECHNOLOGY', emoji: '💻' },
        'ai': { highlight: 'AI', emoji: '🤖' },
        'robot': { highlight: 'ROBOT', emoji: '🤖' },
        'digital': { highlight: 'DIGITAL', emoji: '💻' },
        'internet': { highlight: 'INTERNET', emoji: '🌐' },
        'online': { highlight: 'ONLINE', emoji: '💻' },
        'app': { highlight: 'APP', emoji: '📱' },
        'software': { highlight: 'SOFTWARE', emoji: '💿' },
        'code': { highlight: 'CODE', emoji: '👨‍💻' },
        'data': { highlight: 'DATA', emoji: '📊' },
        'algorithm': { highlight: 'ALGORITHM', emoji: '🧮' },
        'computer': { highlight: 'COMPUTER', emoji: '💻' },
        'phone': { highlight: 'PHONE', emoji: '📱' },
        'smartphone': { highlight: 'SMARTPHONE', emoji: '📱' },
        'camera': { highlight: 'CAMERA', emoji: '📷' },
        'video': { highlight: 'VIDEO', emoji: '🎥' },

        // Health & Fitness
        'health': { highlight: 'HEALTH', emoji: '💪' },
        'fitness': { highlight: 'FITNESS', emoji: '💪' },
        'workout': { highlight: 'WORKOUT', emoji: '🏋️' },
        'exercise': { highlight: 'EXERCISE', emoji: '🏃' },
        'gym': { highlight: 'GYM', emoji: '🏋️' },
        'strong': { highlight: 'STRONG', emoji: '💪' },
        'strength': { highlight: 'STRENGTH', emoji: '💪' },
        'healthy': { highlight: 'HEALTHY', emoji: '🥗' },
        'weight': { highlight: 'WEIGHT', emoji: '⚖️' },
        'diet': { highlight: 'DIET', emoji: '🥗' },
        'energy': { highlight: 'ENERGY', emoji: '⚡' },
        'power': { highlight: 'POWER', emoji: '💪' },

        // Emoji-only words (just add emoji, no capitalization change)
        'fire': { highlight: 'FIRE', emoji: '🔥' },
        'crown': { highlight: 'CROWN', emoji: '👑' },
        'star': { highlight: 'STAR', emoji: '⭐' },
        'heart': { highlight: 'HEART', emoji: '❤️' },
        '100': { highlight: '100', emoji: '💯' },
        'cool': { highlight: 'COOL', emoji: '😎' },
        'party': { highlight: 'PARTY', emoji: '🎉' },
        'celebration': { highlight: 'CELEBRATION', emoji: '🎉' },
        'music': { highlight: 'MUSIC', emoji: '🎵' },
        'song': { highlight: 'SONG', emoji: '🎵' },
        'movie': { highlight: 'MOVIE', emoji: '🎬' },
        'film': { highlight: 'FILM', emoji: '🎞️' },
        'game': { highlight: 'GAME', emoji: '🎮' },
        'gaming': { highlight: 'GAMING', emoji: '🎮' },
        'book': { highlight: 'BOOK', emoji: '📚' },
        'read': { highlight: 'READ', emoji: '📖' },
        'write': { highlight: 'WRITE', emoji: '✍️' },
        'draw': { highlight: 'DRAW', emoji: '🎨' },
        'art': { highlight: 'ART', emoji: '🎨' },
        'design': { highlight: 'DESIGN', emoji: '🎨' },
        'photo': { highlight: 'PHOTO', emoji: '📸' },
        'photography': { highlight: 'PHOTOGRAPHY', emoji: '📸' },
        'rain': { highlight: 'RAIN', emoji: '🌧️' },
        'sun': { highlight: 'SUN', emoji: '☀️' },
        'snow': { highlight: 'SNOW', emoji: '❄️' },
        'storm': { highlight: 'STORM', emoji: '🌩️' },
        'thunder': { highlight: 'THUNDER', emoji: '⚡' },
        'lightning': { highlight: 'LIGHTNING', emoji: '⚡' },
        'ocean': { highlight: 'OCEAN', emoji: '🌊' },
        'sea': { highlight: 'SEA', emoji: '🌊' },
        'mountain': { highlight: 'MOUNTAIN', emoji: '⛰️' },
        'forest': { highlight: 'FOREST', emoji: '🌲' },
        'flower': { highlight: 'FLOWER', emoji: '🌸' },
        'garden': { highlight: 'GARDEN', emoji: '🌺' },
        'baby': { highlight: 'BABY', emoji: '👶' },
        'birthday': { highlight: 'BIRTHDAY', emoji: '🎂' },
        'wedding': { highlight: 'WEDDING', emoji: '💒' },
        'gift': { highlight: 'GIFT', emoji: '🎁' },
        'surprise': { highlight: 'SURPRISE', emoji: '🎁' },
        'magic': { highlight: 'MAGIC', emoji: '✨' },
        'dream': { highlight: 'DREAM', emoji: '💭' },
        'hope': { highlight: 'HOPE', emoji: '🌟' },
        'faith': { highlight: 'FAITH', emoji: '🙏' },
        'peace': { highlight: 'PEACE', emoji: '☮️' },
        'fun': { highlight: 'FUN', emoji: '🎉' },
        'happy': { highlight: 'HAPPY', emoji: '😊' },
        'sad': { highlight: 'SAD', emoji: '😢' },
        'angry': { highlight: 'ANGRY', emoji: '😠' },
        'scared': { highlight: 'SCARED', emoji: '😨' },
        'confused': { highlight: 'CONFUSED', emoji: '😕' },
        'boring': { highlight: 'BORING', emoji: '😴' },
        'tired': { highlight: 'TIRED', emoji: '😴' },
        'sleep': { highlight: 'SLEEP', emoji: '😴' },
        'dreams': { highlight: 'DREAMS', emoji: '💭' },
        'nightmare': { highlight: 'NIGHTMARE', emoji: '😈' },
        'monster': { highlight: 'MONSTER', emoji: '👹' },
        'ghost': { highlight: 'GHOST', emoji: '👻' },
        'spooky': { highlight: 'SPOOKY', emoji: '🎃' },
        'halloween': { highlight: 'HALLOWEEN', emoji: '🎃' },
        'christmas': { highlight: 'CHRISTMAS', emoji: '🎄' },
        'xmas': { highlight: 'XMAS', emoji: '🎄' },
        'happy new year': { highlight: 'HAPPY NEW YEAR', emoji: '🎆' },
        'congratulation': { highlight: 'CONGRATULATIONS', emoji: '🎉' },
        'celebrate': { highlight: 'CELEBRATE', emoji: '🥳' },
        'blessed': { highlight: 'BLESSED', emoji: '🙏' },
        'grateful': { highlight: 'GRATEFUL', emoji: '🙏' },
        'thankful': { highlight: 'THANKFUL', emoji: '🙏' },
        'proud': { highlight: 'PROUD', emoji: '🦚' },

        // Business & Work
        'business': { highlight: 'BUSINESS', emoji: '💼' },
        'startup': { highlight: 'STARTUP', emoji: '🚀' },
        'company': { highlight: 'COMPANY', emoji: '🏢' },
        'enterprise': { highlight: 'ENTERPRISE', emoji: '🏢' },
        'job': { highlight: 'JOB', emoji: '💼' },
        'career': { highlight: 'CAREER', emoji: '📈' },
        'work': { highlight: 'WORK', emoji: '💼' },
        'office': { highlight: 'OFFICE', emoji: '🏢' },
        'meeting': { highlight: 'MEETING', emoji: '📅' },
        'presentation': { highlight: 'PRESENTATION', emoji: '📊' },
        'interview': { highlight: 'INTERVIEW', emoji: '🎙️' },
        'salary': { highlight: 'SALARY', emoji: '💰' },
        'raise': { highlight: 'RAISE', emoji: '📈' },
        'promotion': { highlight: 'PROMOTION', emoji: '⬆️' },
        'bonus': { highlight: 'BONUS', emoji: '🎁' },

        // Love & Relationships
        'relationship': { highlight: 'RELATIONSHIP', emoji: '💑' },
        'marriage': { highlight: 'MARRIAGE', emoji: '💍' },
        'engagement': { highlight: 'ENGAGEMENT', emoji: '💍' },
        'date': { highlight: 'DATE', emoji: '🌹' },
        'romance': { highlight: 'ROMANCE', emoji: '🌹' },
        'valentine': { highlight: 'VALENTINE', emoji: '💝' },
        'crush': { highlight: 'CRUSH', emoji: '😍' },
        'kiss': { highlight: 'KISS', emoji: '💋' },
        'hug': { highlight: 'HUG', emoji: '🤗' },

        // Weather & Nature
        'sunny': { highlight: 'SUNNY', emoji: '☀️' },
        'cloudy': { highlight: 'CLOUDY', emoji: '☁️' },
        'windy': { highlight: 'WINDY', emoji: '🌬️' },
        'cold': { highlight: 'COLD', emoji: '🥶' },
        'hot': { highlight: 'HOT', emoji: '🥵' },
        'warm': { highlight: 'WARM', emoji: '☀️' },
        'freezing': { highlight: 'FREEZING', emoji: '🥶' },
        'summer': { highlight: 'SUMMER', emoji: '☀️' },
        'winter': { highlight: 'WINTER', emoji: '❄️' },
        'spring': { highlight: 'SPRING', emoji: '🌸' },
        'autumn': { highlight: 'AUTUMN', emoji: '🍂' },
        'fall': { highlight: 'FALL', emoji: '🍂' },
        'earth': { highlight: 'EARTH', emoji: '🌍' },
        'sky': { highlight: 'SKY', emoji: '☀️' },
        'water': { highlight: 'WATER', emoji: '💧' },
        'fire': { highlight: 'FIRE', emoji: '🔥' },

        // Sports
        'sport': { highlight: 'SPORT', emoji: '⚽' },
        'sports': { highlight: 'SPORTS', emoji: '⚽' },
        'football': { highlight: 'FOOTBALL', emoji: '🏈' },
        'soccer': { highlight: 'SOCCER', emoji: '⚽' },
        'basketball': { highlight: 'BASKETBALL', emoji: '🏀' },
        'baseball': { highlight: 'BASEBALL', emoji: '⚾' },
        'tennis': { highlight: 'TENNIS', emoji: '🎾' },
        'golf': { highlight: 'GOLF', emoji: '⛳' },
        'swim': { highlight: 'SWIM', emoji: '🏊' },
        'swimming': { highlight: 'SWIMMING', emoji: '🏊' },
        'run': { highlight: 'RUN', emoji: '🏃' },
        'running': { highlight: 'RUNNING', emoji: '🏃' },
        'race': { highlight: 'RACE', emoji: '🏁' },
        'medal': { highlight: 'MEDAL', emoji: '🥇' },
        'olympic': { highlight: 'OLYMPIC', emoji: '🏅' },

        // Music & Entertainment
        'concert': { highlight: 'CONCERT', emoji: '🎤' },
        'festival': { highlight: 'FESTIVAL', emoji: '🎪' },
        'performance': { highlight: 'PERFORMANCE', emoji: '🎭' },
        'show': { highlight: 'SHOW', emoji: '🎭' },
        'theater': { highlight: 'THEATER', emoji: '🎭' },
        'dance': { highlight: 'DANCE', emoji: '💃' },
        'sing': { highlight: 'SING', emoji: '🎤' },
        'singer': { highlight: 'SINGER', emoji: '🎤' },
        'band': { highlight: 'BAND', emoji: '🎸' },
        'guitar': { highlight: 'GUITAR', emoji: '🎸' },
        'piano': { highlight: 'PIANO', emoji: '🎹' },
        'drum': { highlight: 'DRUM', emoji: '🥁' },

        // Verbs - Action
        'destroy': { highlight: 'DESTROY', emoji: '💥' },
        'explode': { highlight: 'EXPLODE', emoji: '💥' },
        'crash': { highlight: 'CRASH', emoji: '💥' },
        'burn': { highlight: 'BURN', emoji: '🔥' },
        'break': { highlight: 'BREAK', emoji: '💔' },
        'build': { highlight: 'BUILD', emoji: '🏗️' },
        'create': { highlight: 'CREATE', emoji: '🎨' },
        'make': { highlight: 'MAKE', emoji: '🔧' },
        'fix': { highlight: 'FIX', emoji: '🔧' },
        'repair': { highlight: 'REPAIR', emoji: '🔧' },
        'launch': { highlight: 'LAUNCH', emoji: '🚀' },
        'start': { highlight: 'START', emoji: '🚀' },
        'begin': { highlight: 'BEGIN', emoji: '🏁' },
        'finish': { highlight: 'FINISH', emoji: '🏁' },
        'end': { highlight: 'END', emoji: '🔚' },
        'open': { highlight: 'OPEN', emoji: '🔓' },
        'close': { highlight: 'CLOSE', emoji: '🔒' },
        'lock': { highlight: 'LOCK', emoji: '🔒' },
        'unlock': { highlight: 'UNLOCK', emoji: '🔓' },
        'connect': { highlight: 'CONNECT', emoji: '🔗' },
        'disconnect': { highlight: 'DISCONNECT', emoji: '🔗' },
        'download': { highlight: 'DOWNLOAD', emoji: '⬇️' },
        'upload': { highlight: 'UPLOAD', emoji: '⬆️' },
        'update': { highlight: 'UPDATE', emoji: '🔄' },
        'delete': { highlight: 'DELETE', emoji: '🗑️' },
        'remove': { highlight: 'REMOVE', emoji: '🗑️' },
        'add': { highlight: 'ADD', emoji: '➕' },
        'plus': { highlight: 'PLUS', emoji: '➕' },
        'minus': { highlight: 'MINUS', emoji: '➖' },
        'error': { highlight: 'ERROR', emoji: '❌' },
        'fail': { highlight: 'FAIL', emoji: '❌' },
        'failed': { highlight: 'FAILED', emoji: '❌' },
        'success': { highlight: 'SUCCESS', emoji: '✅' },
        'pass': { highlight: 'PASS', emoji: '✅' },
        'check': { highlight: 'CHECK', emoji: '✅' },
        'yes': { highlight: 'YES', emoji: '✅' },
        'no': { highlight: 'NO', emoji: '❌' },
        'true': { highlight: 'TRUE', emoji: '✅' },
        'false': { highlight: 'FALSE', emoji: '❌' },
        'correct': { highlight: 'CORRECT', emoji: '✅' },
        'wrong': { highlight: 'WRONG', emoji: '❌' },
        'right': { highlight: 'RIGHT', emoji: '✅' },
        'good': { highlight: 'GOOD', emoji: '👍' },
        'bad': { highlight: 'BAD', emoji: '👎' },
        'best': { highlight: 'BEST', emoji: '🏆' },
        'worst': { highlight: 'WORST', emoji: '💀' },
        'top': { highlight: 'TOP', emoji: '🔝' },
        'bottom': { highlight: 'BOTTOM', emoji: '🔽' },
        'big': { highlight: 'BIG', emoji: '📏' },
        'small': { highlight: 'SMALL', emoji: '📐' },
        'large': { highlight: 'LARGE', emoji: '📏' },
        'huge': { highlight: 'HUGE', emoji: '📏' },
        'tiny': { highlight: 'TINY', emoji: '🐜' },
        'massive': { highlight: 'MASSIVE', emoji: '📏' },
        'major': { highlight: 'MAJOR', emoji: '🔴' },
        'minor': { highlight: 'MINOR', emoji: '🟢' },
        'easy': { highlight: 'EASY', emoji: '😊' },
        'hard': { highlight: 'HARD', emoji: '😤' },
        'difficult': { highlight: 'DIFFICULT', emoji: '😤' },
        'simple': { highlight: 'SIMPLE', emoji: '😊' },
        'complex': { highlight: 'COMPLEX', emoji: '🧩' },
        'possible': { highlight: 'POSSIBLE', emoji: '✨' },
        'impossible': { highlight: 'IMPOSSIBLE', emoji: '🚫' },
        'ready': { highlight: 'READY', emoji: '✅' },
        'set': { highlight: 'SET', emoji: '🔧' },
        'go': { highlight: 'GO', emoji: '🏃' },

        // Miscellaneous viral words
        'triggered': { highlight: 'TRIGGERED', emoji: '😤' },
        'cringe': { highlight: 'CRINGE', emoji: '😬' },
        'cursed': { highlight: 'CURSED', emoji: '☠️' },
        'blessed': { highlight: 'BLESSED', emoji: '🙏' },
        'based': { highlight: 'BASED', emoji: '💪' },
        'woke': { highlight: 'WOKE', emoji: '👁️' },
        'savage': { highlight: 'SAVAGE', emoji: '🔥' },
        'lit': { highlight: 'LIT', emoji: '🔥' },
        'slay': { highlight: 'SLAY', emoji: '💅' },
        'queen': { highlight: 'QUEEN', emoji: '👑' },
        'king': { highlight: 'KING', emoji: '👑' },
        'boss': { highlight: 'BOSS', emoji: '👔' },
        'chef': { highlight: 'CHEF', emoji: '👨‍🍳' },
        'goat': { highlight: 'GOAT', emoji: '🐐' },
        'sigma': { highlight: 'SIGMA', emoji: '🧠' },
        'alpha': { highlight: 'ALPHA', emoji: '🐺' },
        'omega': { highlight: 'OMEGA', emoji: '🐺' },
        'chad': { highlight: 'CHAD', emoji: '💪' },
        'legend': { highlight: 'LEGEND', emoji: '🏆' },
        'icon': { highlight: 'ICON', emoji: '🏛️' },
        'iconic': { highlight: 'ICONIC', emoji: '🏛️' },
        'classic': { highlight: 'CLASSIC', emoji: '🏛️' },
        'vintage': { highlight: 'VINTAGE', emoji: '🎞️' },
        'retro': { highlight: 'RETRO', emoji: '🕹️' },
        'nostalgia': { highlight: 'NOSTALGIA', emoji: '😢' },
        'vibe': { highlight: 'VIBE', emoji: '✨' },
        'vibes': { highlight: 'VIBES', emoji: '✨' },
        'aesthetic': { highlight: 'AESTHETIC', emoji: '✨' },
        'mood': { highlight: 'MOOD', emoji: '🌙' },
        'energy': { highlight: 'ENERGY', emoji: '⚡' },
        'aura': { highlight: 'AURA', emoji: '✨' },
        'moment': { highlight: 'MOMENT', emoji: '⏳' },
        'era': { highlight: 'ERA', emoji: '📅' },
        'chapter': { highlight: 'CHAPTER', emoji: '📖' },
        'phase': { highlight: 'PHASE', emoji: '🔄' },
        'page': { highlight: 'PAGE', emoji: '📄' },
        'story': { highlight: 'STORY', emoji: '📖' },
        'plot': { highlight: 'PLOT', emoji: '📖' },
        'twist': { highlight: 'TWIST', emoji: '🌀' },
        'turn': { highlight: 'TURN', emoji: '🔄' },
        'edge': { highlight: 'EDGE', emoji: '🔪' },
        'dangerous': { highlight: 'DANGEROUS', emoji: '☠️' },
        'safe': { highlight: 'SAFE', emoji: '🛡️' },
        'protect': { highlight: 'PROTECT', emoji: '🛡️' },
        'guard': { highlight: 'GUARD', emoji: '🛡️' },
        'shield': { highlight: 'SHIELD', emoji: '🛡️' },
        'attack': { highlight: 'ATTACK', emoji: '⚔️' },
        'fight': { highlight: 'FIGHT', emoji: '🥊' },
        'battle': { highlight: 'BATTLE', emoji: '⚔️' },
        'war': { highlight: 'WAR', emoji: '⚔️' },
        'peace': { highlight: 'PEACE', emoji: '☮️' },
        'army': { highlight: 'ARMY', emoji: '🪖' },
        'soldier': { highlight: 'SOLDIER', emoji: '🪖' },
        'hero': { highlight: 'HERO', emoji: '🦸' },
        'superhero': { highlight: 'SUPERHERO', emoji: '🦸' },
        'villain': { highlight: 'VILLAIN', emoji: '🦹' },
        'supervillain': { highlight: 'SUPERVILLAIN', emoji: '🦹' },
        'alien': { highlight: 'ALIEN', emoji: '👽' },
        'ufo': { highlight: 'UFO', emoji: '🛸' },
        'space': { highlight: 'SPACE', emoji: '🚀' },
        'planet': { highlight: 'PLANET', emoji: '🪐' },
        'moon': { highlight: 'MOON', emoji: '🌙' },
        'sun': { highlight: 'SUN', emoji: '☀️' },
        'galaxy': { highlight: 'GALAXY', emoji: '🌌' },
        'universe': { highlight: 'UNIVERSE', emoji: '🌌' },
        'dimension': { highlight: 'DIMENSION', emoji: '🌀' },
        'time': { highlight: 'TIME', emoji: '⏰' },
        'space-time': { highlight: 'SPACE-TIME', emoji: '🌀' },
        'reality': { highlight: 'REALITY', emoji: '🌀' },
        'dream': { highlight: 'DREAM', emoji: '💭' },
        'nightmare': { highlight: 'NIGHTMARE', emoji: '😈' },
        'thought': { highlight: 'THOUGHT', emoji: '💭' },
        'idea': { highlight: 'IDEA', emoji: '💡' },
        'brain': { highlight: 'BRAIN', emoji: '🧠' },
        'mind': { highlight: 'MIND', emoji: '🧠' },
        'soul': { highlight: 'SOUL', emoji: '✨' },
        'spirit': { highlight: 'SPIRIT', emoji: '✨' },
        'ghost': { highlight: 'GHOST', emoji: '👻' },
        'angel': { highlight: 'ANGEL', emoji: '👼' },
        'devil': { highlight: 'DEVIL', emoji: '😈' },
        'demon': { highlight: 'DEMON', emoji: '😈' },
        'god': { highlight: 'GOD', emoji: '☁️' },
        'bless': { highlight: 'BLESS', emoji: '🙏' },
        'pray': { highlight: 'PRAY', emoji: '🙏' },
        'miracle': { highlight: 'MIRACLE', emoji: '✨' },
        'heaven': { highlight: 'HEAVEN', emoji: '☁️' },
        'hell': { highlight: 'HELL', emoji: '🔥' },
        'paradise': { highlight: 'PARADISE', emoji: '🏝️' },
        'utopia': { highlight: 'UTOPIA', emoji: '🌅' },
        'dystopia': { highlight: 'DYSTOPIA', emoji: '💀' },
        'apocalypse': { highlight: 'APOCALYPSE', emoji: '💀' },
        'zombie': { highlight: 'ZOMBIE', emoji: '🧟' },
        'vampire': { highlight: 'VAMPIRE', emoji: '🧛' },
        'werewolf': { highlight: 'WEREWOLF', emoji: '🐺' },
        'witch': { highlight: 'WITCH', emoji: '🧙' },
        'wizard': { highlight: 'WIZARD', emoji: '🧙' },
        'magic': { highlight: 'MAGIC', emoji: '✨' },
        'spell': { highlight: 'SPELL', emoji: '🔮' },
        'curse': { highlight: 'CURSE', emoji: '☠️' },
        'potion': { highlight: 'POTION', emoji: '🧪' },
        'potion': { highlight: 'POTION', emoji: '🧪' },
        'sword': { highlight: 'SWORD', emoji: '⚔️' },
        'shield': { highlight: 'SHIELD', emoji: '🛡️' },
        'armor': { highlight: 'ARMOR', emoji: '🛡️' },
        'crown': { highlight: 'CROWN', emoji: '👑' },
        'throne': { highlight: 'THRONE', emoji: '👑' },
        'castle': { highlight: 'CASTLE', emoji: '🏰' },
        'kingdom': { highlight: 'KINGDOM', emoji: '🏰' },
        'dragon': { highlight: 'DRAGON', emoji: '🐉' },
        'phoenix': { highlight: 'PHOENIX', emoji: '🐦‍🔥' },
        'unicorn': { highlight: 'UNICORN', emoji: '🦄' },
        'pegasus': { highlight: 'PEGASUS', emoji: '🦄' },
        'griffin': { highlight: 'GRIFFIN', emoji: '🦅' },
        'centaur': { highlight: 'CENTAUR', emoji: '🐴' },
        'mermaid': { highlight: 'MERMAID', emoji: '🧜‍♀️' },
        'fairy': { highlight: 'FAIRY', emoji: '🧚' },
        'elf': { highlight: 'ELF', emoji: '🧝' },
        'dwarf': { highlight: 'DWARF', emoji: '⛰️' },
        'giant': { highlight: 'GIANT', emoji: '🗿' },
        'titan': { highlight: 'TITAN', emoji: '🗿' },
        'cyclops': { highlight: 'CYCLOPS', emoji: '👁️' },
        'minotaur': { highlight: 'MINOTAUR', emoji: '🐂' },
        'harpy': { highlight: 'HARPY', emoji: '🦅' },
        'siren': { highlight: 'SIREN', emoji: '🧜‍♀️' },
        'nymph': { highlight: 'NYMPH', emoji: '🧚' },
        'satyr': { highlight: 'SATYR', emoji: '🐐' },
        'faun': { highlight: 'FAUN', emoji: '🐐' },
        'pixie': { highlight: 'PIXIE', emoji: '🧚' },
        'goblin': { highlight: 'GOBLIN', emoji: '👺' },
        'orc': { highlight: 'ORC', emoji: '👹' },
        'ogre': { highlight: 'OGRE', emoji: '👹' },
        'troll': { highlight: 'TROLL', emoji: '🧌' },
        'hobbit': { highlight: 'HOBBIT', emoji: '🧝' },
        'halfling': { highlight: 'HALFLING', emoji: '🧝' },
        'gnome': { highlight: 'GNOME', emoji: '🧌' },
        'knight': { highlight: 'KNIGHT', emoji: '🛡️' },
        'paladin': { highlight: 'PALADIN', emoji: '🛡️' },
        'ranger': { highlight: 'RANGER', emoji: '🏹' },
        'archer': { highlight: 'ARCHER', emoji: '🏹' },
        'assassin': { highlight: 'ASSASSIN', emoji: '🗡️' },
        'rogue': { highlight: 'ROGUE', emoji: '🗡️' },
        'thief': { highlight: 'THIEF', emoji: '🗡️' },
        'bard': { highlight: 'BARD', emoji: '🎵' },
        'mage': { highlight: 'MAGE', emoji: '🧙' },
        'sorcerer': { highlight: 'SORCERER', emoji: '🧙' },
        'warlock': { highlight: 'WARLOCK', emoji: '🧙' },
        'necromancer': { highlight: 'NECROMANCER', emoji: '💀' },
        'druid': { highlight: 'DRUID', emoji: '🌿' },
        'shaman': { highlight: 'SHAMAN', emoji: '🪶' },
        'monk': { highlight: 'MONK', emoji: '🧘' },
        'ninja': { highlight: 'NINJA', emoji: '🥷' },
        'samurai': { highlight: 'SAMURAI', emoji: '⚔️' },
        'viking': { highlight: 'VIKING', emoji: '⛵' },
        'berserker': { highlight: 'BERSERKER', emoji: '🪓' },
        'gladiator': { highlight: 'GLADIATOR', emoji: '⚔️' },
        'spartan': { highlight: 'SPARTAN', emoji: '🛡️' },
        'centurion': { highlight: 'CENTURION', emoji: '🛡️' },
        'legion': { highlight: 'LEGION', emoji: '🪖' },
        'pharaoh': { highlight: 'PHARAOH', emoji: '👑' },
        'emperor': { highlight: 'EMPEROR', emoji: '👑' },
        'king': { highlight: 'KING', emoji: '👑' },
        'queen': { highlight: 'QUEEN', emoji: '👑' },
        'prince': { highlight: 'PRINCE', emoji: '👑' },
        'princess': { highlight: 'PRINCESS', emoji: '👑' },
        'duke': { highlight: 'DUKE', emoji: '👑' },
        'duchess': { highlight: 'DUCHESS', emoji: '👑' },
        'lord': { highlight: 'LORD', emoji: '👑' },
        'lady': { highlight: 'LADY', emoji: '👑' },
        'sir': { highlight: 'SIR', emoji: '⚔️' },
        'dame': { highlight: 'DAME', emoji: '⚔️' },
        'count': { highlight: 'COUNT', emoji: '👑' },
        'countess': { highlight: 'COUNTESS', emoji: '👑' },
        'baron': { highlight: 'BARON', emoji: '👑' },
        'baroness': { highlight: 'BARONESS', emoji: '👑' },
        'earl': { highlight: 'EARL', emoji: '👑' },
        'viscount': { highlight: 'VISCOUNT', emoji: '👑' },
        'marquis': { highlight: 'MARQUIS', emoji: '👑' },
        'marquess': { highlight: 'MARQUESS', emoji: '👑' },
        'archduke': { highlight: 'ARCHDUKE', emoji: '👑' },
        'tsar': { highlight: 'TSAR', emoji: '👑' },
        'sultan': { highlight: 'SULTAN', emoji: '👑' },
        'caliph': { highlight: 'CALIPH', emoji: '👑' },
        'shah': { highlight: 'SHAH', emoji: '👑' },
        'emir': { highlight: 'EMIR', emoji: '👑' },
        'sheikh': { highlight: 'SHEIKH', emoji: '👑' },
        'maharajah': { highlight: 'MAHARAJAH', emoji: '👑' },
        'kaiser': { highlight: 'KAISER', emoji: '👑' },
        'caesar': { highlight: 'CAESAR', emoji: '👑' },
        'augustus': { highlight: 'AUGUSTUS', emoji: '👑' },
        'napoleon': { highlight: 'NAPOLEON', emoji: '👑' },
        'genghis': { highlight: 'GENGHIS', emoji: '👑' },
        'atilla': { highlight: 'ATILLA', emoji: '👑' },
        'cleopatra': { highlight: 'CLEOPATRA', emoji: '👑' },
        'nefertiti': { highlight: 'NEFERTITI', emoji: '👑' },
        'ramses': { highlight: 'RAMSES', emoji: '👑' },
        'tutankhamun': { highlight: 'TUTANKHAMUN', emoji: '👑' },
        'alexander': { highlight: 'ALEXANDER', emoji: '👑' },
        'hannibal': { highlight: 'HANNIBAL', emoji: '👑' },
        'boudica': { highlight: 'BOUDICA', emoji: '👑' },
        'joan of arc': { highlight: 'JOAN OF ARC', emoji: '👑' },
        'spartacus': { highlight: 'SPARTACUS', emoji: '⚔️' }
    };

    // Sort dictionary by word length (longest first) to match phrases before single words
    const POWER_WORD_ENTRIES = Object.entries(POWER_WORD_DICT)
        .sort((a, b) => b[0].length - a[0].length);

    function applyEmojiAndHighlighting(text) {
        if (!text) return text;

        let result = text;

        // Process each power word entry
        for (const [word, data] of POWER_WORD_ENTRIES) {
            // Create case-insensitive regex for whole word matching
            const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`\\b${escapedWord}\\b`, 'gi');

            // Replace each match with highlighted + emoji version
            result = result.replace(regex, (match) => {
                // Preserve original case of first letter if possible
                const isCapitalized = match[0] === match[0].toUpperCase();
                const highlight = isCapitalized 
                    ? data.highlight.charAt(0).toUpperCase() + data.highlight.slice(1).toLowerCase()
                    : data.highlight.toLowerCase();
                
                // Add emoji after the word
                return `${highlight} ${data.emoji}`;
            });
        }

        return result;
    }

    // =============================================
    // 3. NLE NATIVE BRIDGE EXPORTERS
    //    Export subtitle data to various NLE formats
    // =============================================

    // --- DaVinci Resolve EDL Export ---
    function exportEDL(subtitles) {
        if (!subtitles || subtitles.length === 0) return '';

        const lines = [];
        lines.push('TITLE: SRT Snap Export');
        lines.push('FCM: NON-DROP FRAME');
        lines.push('');

        subtitles.forEach((sub, i) => {
            const seq = i + 1;
            const reel = 'AX';
            // EDL timecode format: HH:MM:SS:FF (assumes 30fps)
            const startTC = formatEDLTimecode(sub.start);
            const endTC = formatEDLTimecode(sub.end);
            const duration = formatEDLTimecode(sub.duration || (sub.end - sub.start));

            lines.push(`${seq.toString().padStart(3, '0')}  ${reel}      V     C        ${startTC} ${endTC} ${startTC} ${endTC}`);
            lines.push(`* FROM CLIP NAME: Subtitle ${seq}: ${sub.text.replace(/"/g, '').substring(0, 60)}`);
            lines.push('');
        });

        return lines.join('\n');
    }

    function formatEDLTimecode(seconds) {
        const fps = 30;
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const f = Math.floor((seconds % 1) * fps);
        return `${pad2(h)}:${pad2(m)}:${pad2(s)}:${pad2(f)}`;
    }
    function pad2(n) { return n.toString().padStart(2, '0'); }

    // --- Premiere Pro XML Export (FCP XML interchange format) ---
    function exportPremiereXML(subtitles) {
        if (!subtitles || subtitles.length === 0) return '';

        const fps = 30;
        const timecale = fps;

        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<!DOCTYPE xmeml>\n';
        xml += '<xmeml version="5">\n';
        xml += '  <sequence>\n';
        xml += '    <name>SRT Snap Subtitles</name>\n';
        xml += '    <duration>' + Math.ceil((subtitles[subtitles.length - 1]?.end || 60) * fps) + '</duration>\n';
        xml += '    <rate>\n';
        xml += '      <timebase>' + fps + '</timebase>\n';
        xml += '      <ntsc>FALSE</ntsc>\n';
        xml += '    </rate>\n';
        xml += '    <media>\n';
        xml += '      <video>\n';
        xml += '        <format>\n';
        xml += '          <samplecharacteristics>\n';
        xml += '            <rate>\n';
        xml += '              <timebase>' + fps + '</timebase>\n';
        xml += '              <ntsc>FALSE</ntsc>\n';
        xml += '            </rate>\n';
        xml += '            <width>1920</width>\n';
        xml += '            <height>1080</height>\n';
        xml += '          </samplecharacteristics>\n';
        xml += '        </format>\n';
        xml += '        <track>\n';
        xml += '          <enabled>TRUE</enabled>\n';
        xml += '          <locked>FALSE</locked>\n';

        subtitles.forEach((sub, i) => {
            const startFrames = Math.round(sub.start * fps);
            const endFrames = Math.round(sub.end * fps);
            const durFrames = endFrames - startFrames;

            xml += '          <clipitem id="subtitle-' + (i + 1) + '">\n';
            xml += '            <masterclipid>master-subtitle-' + (i + 1) + '</masterclipid>\n';
            xml += '            <name>Subtitle ' + (i + 1) + '</name>\n';
            xml += '            <duration>' + durFrames + '</duration>\n';
            xml += '            <rate>\n';
            xml += '              <timebase>' + fps + '</timebase>\n';
            xml += '              <ntsc>FALSE</ntsc>\n';
            xml += '            </rate>\n';
            xml += '            <start>' + startFrames + '</start>\n';
            xml += '            <end>' + endFrames + '</end>\n';
            xml += '            <in>0</in>\n';
            xml += '            <out>' + durFrames + '</out>\n';
            xml += '            <enabled>TRUE</enabled>\n';
            xml += '            <ismaster>FALSE</ismaster>\n';
            xml += '            <labels>\n';
            xml += '              <label2>Subtitle</label2>\n';
            xml += '            </labels>\n';
            xml += '            <filter>\n';
            xml += '              <effect>\n';
            xml += '                <name>Subtitle Text</name>\n';
            xml += '                <effectid>subtitle</effectid>\n';
            xml += '                <effectcategory>generator</effectcategory>\n';
            xml += '                <param>\n';
            xml += '                  <parameterid>text</parameterid>\n';
            xml += '                  <name>Text</name>\n';
            xml += '                  <valuetype>4</valuetype>\n';
            xml += '                  <value>' + escapeXml(sub.text) + '</value>\n';
            xml += '                </param>\n';
            xml += '              </effect>\n';
            xml += '            </filter>\n';
            xml += '          </clipitem>\n';
        });

        xml += '        </track>\n';
        xml += '      </video>\n';
        xml += '    </media>\n';
        xml += '  </sequence>\n';
        xml += '</xmeml>';

        return xml;
    }

    function escapeXml(str) {
        return str.replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;')
                  .replace(/'/g, '&apos;');
    }

    // --- CSV Export ---
    function exportCSV(subtitles) {
        if (!subtitles || subtitles.length === 0) return '';

        const rows = [['Sequence', 'Start Time', 'End Time', 'Duration (s)', 'Text']];
        subtitles.forEach(sub => {
            rows.push([
                sub.sequence || (subtitles.indexOf(sub) + 1),
                formatSRTTime(sub.start),
                formatSRTTime(sub.end),
                (sub.duration || (sub.end - sub.start)).toFixed(3),
                sub.text
            ]);
        });

        return rows.map(row => 
            row.map(cell => {
                if (typeof cell === 'string' && (cell.includes(',') || cell.includes('"') || cell.includes('\n'))) {
                    return '"' + cell.replace(/"/g, '""') + '"';
                }
                return cell;
            }).join(',')
        ).join('\n');
    }

    function formatSRTTime(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 1000);
        return `${pad2(h)}:${pad2(m)}:${pad2(s)},${ms.toString().padStart(3, '0')}`;
    }

    // =============================================
    // 4. SRT-TO-BRAND-KIT
    //    Extract social media content from SRT transcripts
    // =============================================
    function generateBrandKit(subtitles, options = {}) {
        const {
            videoTitle = 'Untitled Video',
            creatorName = 'Content Creator',
            includeYouTube = true,
            includeTwitter = true,
            includeLinkedIn = true,
            maxTweetLength = 280
        } = options;

        if (!subtitles || subtitles.length === 0) {
            return { error: 'No subtitles provided.' };
        }

        // Get full transcript
        const fullText = subtitles.map(s => s.text).join(' ');
        const words = fullText.split(/\s+/).filter(w => w.length > 0);
        const wordCount = words.length;
        const totalDuration = subtitles.length > 0 
            ? (subtitles[subtitles.length - 1].end - subtitles[0].start) 
            : 0;
        const durationStr = formatDuration(totalDuration);

        // Get first subtitle text (hook)
        const firstLine = subtitles[0]?.text || '';
        // Get key topics (most frequent non-stop words)
        const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their', 'mine', 'yours', 'hers', 'ours', 'theirs']);
        const wordFreq = {};
        words.forEach(w => {
            const lower = w.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (lower && !stopWords.has(lower) && lower.length > 2) {
                wordFreq[lower] = (wordFreq[lower] || 0) + 1;
            }
        });
        const keywords = Object.entries(wordFreq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([word]) => word);

        const result = {
            metadata: {
                title: videoTitle,
                creator: creatorName,
                duration: durationStr,
                wordCount,
                subtitleCount: subtitles.length,
                keywords
            },
            fullTranscript: fullText,
            timestampedTranscript: subtitles.map(s => ({
                time: formatSRTTime(s.start),
                text: s.text
            }))
        };

        // YouTube Description
        if (includeYouTube) {
            result.youtube = {
                title: videoTitle,
                description: generateYouTubeDescription(videoTitle, fullText, keywords, creatorName, durationStr)
            };
        }

        // Twitter/X Thread
        if (includeTwitter) {
            result.twitter = generateTwitterThread(fullText, firstLine, keywords, maxTweetLength);
        }

        // LinkedIn Post
        if (includeLinkedIn) {
            result.linkedin = generateLinkedInPost(videoTitle, fullText, keywords, creatorName);
        }

        return result;
    }

    function generateYouTubeDescription(title, transcript, keywords, creator, duration) {
        const lines = [];
        lines.push(title);
        lines.push('');
        lines.push(`📺 In this ${duration} video, we dive deep into ${keywords.slice(0, 3).join(', ')} and more.`);
        lines.push('');
        lines.push('📋 Timestamps:');
        lines.push('');

        // Add key moments from transcript (roughly every 30 seconds)
        const words = transcript.split(/\s+/);
        const wordsPerSegment = Math.max(50, Math.floor(words.length / 10));
        let timeAccum = 0;
        for (let i = 0; i < words.length; i += wordsPerSegment) {
            const segment = words.slice(i, i + wordsPerSegment).join(' ');
            const minutes = Math.floor(timeAccum / 60);
            const seconds = Math.floor(timeAccum % 60);
            const timestamp = `${pad2(minutes)}:${pad2(seconds)}`;
            const snippet = segment.substring(0, 80) + (segment.length > 80 ? '...' : '');
            lines.push(`${timestamp} - ${snippet}`);
            timeAccum += 30;
        }

        lines.push('');
        lines.push('🔑 Key Topics:');
        lines.push(keywords.map(k => `#${k.replace(/\s+/g, '')}`).join(' '));
        lines.push('');
        lines.push('---');
        lines.push(`👤 Created by ${creator}`);
        lines.push('🎬 Subtitles edited with SRT Snap');
        lines.push('');

        return lines.join('\n');
    }

    function generateTwitterThread(fullText, firstLine, keywords, maxLength) {
        const thread = [];
        
        // Tweet 1: Hook
        let tweet1 = firstLine.substring(0, maxLength - 30);
        if (firstLine.length > maxLength - 30) tweet1 += '...';
        tweet1 += '\n\n🧵 A thread on ' + keywords.slice(0, 2).join(' & ') + ' 📖';
        if (tweet1.length > maxLength) {
            tweet1 = firstLine.substring(0, maxLength - 40);
            tweet1 += '... 🧵';
        }
        thread.push(tweet1);

        // Split remaining text into tweet-sized chunks
        const words = fullText.split(/\s+/);
        const wordsPerTweet = Math.floor(40); // ~40 words per tweet
        let tweetNum = 2;

        for (let i = 0; i < words.length; i += wordsPerTweet) {
            let tweet = words.slice(i, i + wordsPerTweet).join(' ');
            if (tweet.length > maxLength - 10) {
                tweet = tweet.substring(0, maxLength - 30) + '...';
            }
            if (tweet.trim()) {
                thread.push(tweet);
                tweetNum++;
            }
        }

        // Final tweet: call to action
        const hashtags = keywords.slice(0, 5).map(k => `#${k.replace(/\s+/g, '')}`).join(' ');
        thread.push(`💡 That's the summary! ${hashtags}\n\n👍 Like if you found this useful! 🔄 Share to help others!`);

        return thread;
    }

    function generateLinkedInPost(title, transcript, keywords, creator) {
        const lines = [];
        lines.push(`📢 ${title}`);
        lines.push('');
        lines.push(`I just finished breaking down ${keywords.slice(0, 3).join(', ')} in my latest video.`);
        lines.push('');
        lines.push('Here\'s what I covered:');
        lines.push('');

        // Pull key sentences from transcript
        const sentences = transcript.match(/[^.!?]+[.!?]+/g) || [transcript];
        const keyPoints = sentences.slice(0, 5);
        keyPoints.forEach((s, i) => {
            const trimmed = s.trim();
            if (trimmed) {
                lines.push(`${i + 1}. ${trimmed}`);
            }
        });

        lines.push('');
        lines.push(`💡 Pro tip: ${keywords.length > 0 ? 'Focus on ' + keywords[0] + ' to get the best results.' : 'Check the full video for more insights.'}`);
        lines.push('');
        lines.push(`Created by ${creator} | Powered by SRT Snap`);
        lines.push('');
        lines.push(keywords.map(k => `#${k.replace(/\s+/g, '')}`).join(' '));

        return lines.join('\n');
    }

    function formatDuration(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        if (mins >= 60) {
            const hours = Math.floor(mins / 60);
            const remainMins = mins % 60;
            return `${hours}h ${remainMins}m`;
        }
        return `${mins}m ${secs}s`;
    }

    // =============================================
    // DOWNLOAD HELPER
    // =============================================
    function downloadFile(content, filename, mimeType = 'text/plain') {
        const blob = new Blob([content], { type: mimeType + ';charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // =============================================
    // GET FULL TRANSCRIPT TEXT
    // =============================================
    function getTranscript(subtitles) {
        if (!subtitles || subtitles.length === 0) return '';
        return subtitles.map(s => s.text).join(' ');
    }

    // =============================================
    // PUBLIC API
    // =============================================
    return {
        // 1. Micro-Chunker
        microChunkSRT,
        // 2. Emoji & Highlighting
        applyEmojiAndHighlighting,
        getPowerWordCount: () => Object.keys(POWER_WORD_DICT).length,
        getPowerWordEntries: () => POWER_WORD_ENTRIES,
        // 3. NLE Exporters
        exportEDL,
        exportPremiereXML,
        exportCSV,
        // 4. Brand Kit
        generateBrandKit,
        // Utilities
        getTranscript,
        downloadFile
    };
})();
