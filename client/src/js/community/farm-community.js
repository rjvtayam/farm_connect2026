/**
 * Farm Connect — Community Social Feed (Standalone)
 * Posts, reactions, comments, profile, topics, search
 */

document.addEventListener('DOMContentLoaded', () => {
    // Initialize state from body data attributes
    const body = document.body;
    window.__FC_AUTH__ = body.dataset.auth === 'true';
    window.__FC_USER_ID__ = body.dataset.userId !== 'null' ? parseInt(body.dataset.userId) : null;
    window.__FC_USER_ROLE__ = body.dataset.userRole || '';

    initFeed();
    initComposer();
    initLoadMore();
    initMenuClose();
    initProfileDropdown();
    initProfileModal();
    initTopicSelector();
    initSidebarNav();
    initTopicFilter();
    initSearch();
    loadStats();
});

/* ── State ── */
let currentPage = 1;
let hasNextPage = false;
let isLoading = false;
let activeFilter = 'all';
let activeTopic = '';
let searchQuery = '';
let selectedPostTopic = '';

const REACTION_MAP = {
    like: { emoji: '👍', label: 'Like', icon: 'fa-thumbs-up' },
    love: { emoji: '❤️', label: 'Love', icon: 'fa-heart' },
    haha: { emoji: '😂', label: 'Haha', icon: 'fa-laugh-squint' },
    wow: { emoji: '😮', label: 'Wow', icon: 'fa-surprise' },
    sad: { emoji: '😢', label: 'Sad', icon: 'fa-sad-tear' },
    angry: { emoji: '😡', label: 'Angry', icon: 'fa-angry' },
};

const TOPIC_EMOJI = {
    crops: '🌾', livestock: '🐄', fishery: '🐟',
    market: '📈', tips: '💡', events: '📅', general: '💬'
};

/* ═══════════════════════════════════════════════════════
   FEED LOADING
   ═══════════════════════════════════════════════════════ */
function initFeed() { loadPosts(); }

function loadPosts(append = false) {
    if (isLoading) return;
    isLoading = true;

    const loader = document.getElementById('feedLoader');
    const emptyState = document.getElementById('emptyFeed');
    const loadMoreWrapper = document.getElementById('loadMoreWrapper');

    if (!append && loader) loader.style.display = '';

    let url = `/community/api/posts?page=${currentPage}&per_page=15`;
    if (activeFilter === 'popular') url += '&sort=popular';
    if (activeFilter === 'my-posts') url += '&filter=mine';
    if (activeTopic) url += `&topic=${activeTopic}`;
    if (searchQuery) url += `&q=${encodeURIComponent(searchQuery)}`;

    fetch(url, { credentials: 'include' })
        .then(r => r.json())
        .then(data => {
            if (!data.success) return;
            if (loader) loader.style.display = 'none';

            const container = document.getElementById('feedContainer');
            if (!append) {
                // Clear existing posts (keep loader)
                Array.from(container.children).forEach(c => {
                    if (c.id !== 'feedLoader') c.remove();
                });
            }

            if (!append && data.posts.length === 0) {
                if (emptyState) emptyState.style.display = '';
                if (loadMoreWrapper) loadMoreWrapper.style.display = 'none';
                return;
            }
            if (emptyState) emptyState.style.display = 'none';

            data.posts.forEach((post, i) => {
                const el = createPostElement(post);
                el.style.animationDelay = `${i * 0.05}s`;
                container.appendChild(el);
            });

            hasNextPage = data.has_next;
            if (loadMoreWrapper) loadMoreWrapper.style.display = hasNextPage ? '' : 'none';
        })
        .catch(err => {
            console.error('Feed load error:', err);
            if (loader) loader.innerHTML = '<p style="color:var(--text-muted)">Failed to load posts.</p>';
        })
        .finally(() => { isLoading = false; });
}

function resetAndReload() {
    currentPage = 1;
    hasNextPage = false;
    loadPosts(false);
}

function initLoadMore() {
    const btn = document.getElementById('loadMoreBtn');
    if (!btn) return;
    btn.addEventListener('click', () => { currentPage++; loadPosts(true); });
}

/* ═══════════════════════════════════════════════════════
   CREATE POST ELEMENT
   ═══════════════════════════════════════════════════════ */
function createPostElement(post) {
    const template = document.getElementById('postTemplate');
    const clone = template.content.cloneNode(true);
    const article = clone.querySelector('.post-card');
    article.dataset.postId = post.id;

    // Avatar
    const avatarEl = article.querySelector('[data-avatar]');
    if (post.author_avatar) {
        const img = document.createElement('img');
        img.src = post.author_avatar;
        img.alt = post.author_name;
        img.style.cssText = 'width:40px;height:40px;border-radius:50%;object-fit:cover;';
        avatarEl.replaceWith(img);
    } else {
        avatarEl.textContent = (post.author_name || 'U')[0].toUpperCase();
    }

    // Author / meta
    article.querySelector('[data-author]').textContent = post.author_name;

    const roleBadge = article.querySelector('[data-role]');
    if (post.author_role) {
        roleBadge.textContent = post.author_role.toUpperCase();
        roleBadge.classList.add(`role-${post.author_role}`);
    } else {
        roleBadge.style.display = 'none';
    }

    // Topic badge
    const topicBadge = article.querySelector('[data-topic-badge]');
    if (post.topic && TOPIC_EMOJI[post.topic]) {
        topicBadge.textContent = `${TOPIC_EMOJI[post.topic]} ${post.topic}`;
        topicBadge.style.display = '';
    }

    article.querySelector('[data-time]').textContent = timeAgo(post.created_at);

    // Content
    article.querySelector('[data-content]').textContent = post.content;

    // Image
    if (post.image_url) {
        const wrap = article.querySelector('[data-image-wrap]');
        wrap.style.display = '';
        wrap.querySelector('[data-image]').src = post.image_url;
    }

    // Stats & reaction button
    updateStatsBar(article, post);
    updateReactButton(article, post);

    // Menu (owner or admin)
    const menuBtn = article.querySelector('[data-menu-btn]');
    const menuDropdown = article.querySelector('[data-menu-dropdown]');
    const deleteBtn = article.querySelector('[data-delete-btn]');
    const uid = window.__FC_USER_ID__;

    if (uid && (post.user_id === uid || window.__FC_USER_ROLE__ === 'admin')) {
        menuBtn.addEventListener('click', e => {
            e.stopPropagation();
            document.querySelectorAll('.post-menu-dropdown.active').forEach(d => d.classList.remove('active'));
            menuDropdown.classList.toggle('active');
        });
        deleteBtn.addEventListener('click', () => deletePost(post.id, article));
    } else {
        menuBtn.style.display = 'none';
    }

    // Reactions
    if (window.__FC_AUTH__) {
        const picker = article.querySelector('[data-reaction-picker]');
        picker.querySelectorAll('.reaction-emoji').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                toggleReaction(post.id, btn.dataset.reaction, article);
                picker.classList.remove('active');
            });
        });

        const reactBtn = article.querySelector('[data-react-btn]');
        reactBtn.addEventListener('click', () => {
            toggleReaction(post.id, reactBtn.dataset.currentReaction || 'like', article);
        });
    }

    // Comments toggle
    const commentToggle = article.querySelector('[data-comment-toggle]');
    const commentsSection = article.querySelector('[data-comments-section]');
    commentToggle.addEventListener('click', () => {
        const visible = commentsSection.style.display !== 'none';
        commentsSection.style.display = visible ? 'none' : '';
        if (!visible) loadComments(post.id, article);
    });

    // Comment input
    if (window.__FC_AUTH__) {
        const sendBtn = article.querySelector('[data-comment-send]');
        const input = article.querySelector('[data-comment-input]');
        if (sendBtn && input) {
            sendBtn.addEventListener('click', () => submitComment(post.id, input, article));
            input.addEventListener('keydown', e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(post.id, input, article); }
            });
        }
    }

    // Share
    const shareBtn = article.querySelector('[data-share-btn]');
    if (shareBtn) {
        shareBtn.addEventListener('click', () => {
            const url = `${window.location.origin}/community#post-${post.id}`;
            if (navigator.clipboard) {
                navigator.clipboard.writeText(url);
                shareBtn.innerHTML = '<i class="fas fa-check"></i> <span>Copied!</span>';
                setTimeout(() => { shareBtn.innerHTML = '<i class="far fa-share-square"></i> <span>Share</span>'; }, 2000);
            }
        });
    }

    return article;
}

/* ═══════════════════════════════════════════════════════
   STATS & REACTION HELPERS
   ═══════════════════════════════════════════════════════ */
function updateStatsBar(article, post) {
    const summary = article.querySelector('[data-reaction-summary]');
    const commentCount = article.querySelector('[data-comment-count]');

    if (post.total_reactions > 0) {
        const topEmojis = Object.entries(post.reaction_counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([type]) => REACTION_MAP[type]?.emoji || '👍');
        summary.innerHTML = `<span class="emoji-stack">${topEmojis.map(e => `<span>${e}</span>`).join('')}</span> ${post.total_reactions}`;
    } else { summary.textContent = ''; }

    if (post.comment_count > 0) {
        commentCount.textContent = `${post.comment_count} comment${post.comment_count > 1 ? 's' : ''}`;
    } else { commentCount.textContent = ''; }
}

function updateReactButton(article, post) {
    const reactBtn = article.querySelector('[data-react-btn]');
    if (!reactBtn) return;
    reactBtn.className = 'action-btn react-btn';

    if (post.user_reaction) {
        const r = REACTION_MAP[post.user_reaction];
        reactBtn.classList.add('reacted', `reacted-${post.user_reaction}`);
        reactBtn.innerHTML = `<span>${r.emoji}</span> <span>${r.label}</span>`;
        reactBtn.dataset.currentReaction = post.user_reaction;
    } else {
        reactBtn.innerHTML = `<i class="far fa-thumbs-up"></i> <span>Like</span>`;
        reactBtn.dataset.currentReaction = 'like';
    }
}

/* ═══════════════════════════════════════════════════════
   POST COMPOSER
   ═══════════════════════════════════════════════════════ */
function initComposer() {
    const textarea = document.getElementById('postContent');
    const submitBtn = document.getElementById('submitPostBtn');
    const charCounter = document.getElementById('charCounter');
    if (!textarea || !submitBtn) return;

    textarea.addEventListener('input', () => {
        submitBtn.disabled = textarea.value.trim().length === 0;
        if (charCounter) charCounter.textContent = `${textarea.value.length.toLocaleString()} / 5,000`;
    });

    submitBtn.addEventListener('click', () => createPost(textarea, submitBtn));
}

function createPost(textarea, submitBtn) {
    const content = textarea.value.trim();
    if (!content) return;

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Posting…';

    const body = { content };
    if (selectedPostTopic) body.topic = selectedPostTopic;

    fetch('/community/api/posts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                textarea.value = '';
                const cc = document.getElementById('charCounter');
                if (cc) cc.textContent = '0 / 5,000';

                // Clear selected topic
                selectedPostTopic = '';
                const disp = document.getElementById('selectedTopicDisplay');
                if (disp) disp.style.display = 'none';

                const container = document.getElementById('feedContainer');
                const el = createPostElement(data.post);
                const emptyState = document.getElementById('emptyFeed');
                if (emptyState) emptyState.style.display = 'none';

                const loader = document.getElementById('feedLoader');
                if (loader && loader.nextSibling) {
                    container.insertBefore(el, loader.nextSibling);
                } else {
                    container.appendChild(el);
                }

                // Update stats
                loadStats();
            } else {
                alert(data.message || 'Failed to create post.');
            }
        })
        .catch(() => alert('Network error. Please try again.'))
        .finally(() => {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Post <i class="fas fa-paper-plane"></i>';
        });
}

/* ═══════════════════════════════════════════════════════
   DELETE POST
   ═══════════════════════════════════════════════════════ */
function deletePost(postId, article) {
    Swal.fire({
        title: 'Delete this post?',
        text: "This action cannot be undone.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e3342f',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Yes, delete it!'
    }).then((result) => {
        if (result.isConfirmed) {
            fetch(`/community/api/posts/${postId}`, { method: 'DELETE', credentials: 'include' })
                .then(r => r.json())
                .then(data => {
                    if (data.success) {
                        article.style.transition = 'all 0.3s ease';
                        article.style.opacity = '0';
                        article.style.transform = 'scale(0.95)';
                        setTimeout(() => article.remove(), 300);
                        loadStats();
                    }
                });
        }
    });
}

/* ═══════════════════════════════════════════════════════
   REACTIONS
   ═══════════════════════════════════════════════════════ */
function toggleReaction(postId, type, article) {
    fetch(`/community/api/posts/${postId}/react`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
    })
        .then(r => r.json())
        .then(data => {
            if (data.success && data.post) {
                updateStatsBar(article, data.post);
                updateReactButton(article, data.post);
            }
        });
}

/* ═══════════════════════════════════════════════════════
   COMMENTS
   ═══════════════════════════════════════════════════════ */
function loadComments(postId, article) {
    const list = article.querySelector('[data-comments-list]');
    if (!list) return;
    list.innerHTML = '<div style="text-align:center;padding:0.5rem;color:var(--text-muted);font-size:0.78rem">Loading…</div>';

    fetch(`/community/api/posts/${postId}/comments`, { credentials: 'include' })
        .then(r => r.json())
        .then(data => {
            list.innerHTML = '';
            if (data.success && data.comments.length > 0) {
                data.comments.forEach(c => list.appendChild(createCommentElement(c)));
            } else {
                list.innerHTML = '<div style="text-align:center;padding:0.5rem;color:var(--text-muted);font-size:0.75rem">No comments yet. Be the first!</div>';
            }
        });
}

function createCommentElement(c) {
    const div = document.createElement('div');
    div.className = 'comment-item';
    div.dataset.commentId = c.id;

    const initial = (c.author_name || 'U')[0].toUpperCase();
    const avatarHtml = c.author_avatar
        ? `<img src="${c.author_avatar}" alt="" style="width:28px;height:28px;border-radius:50%;object-fit:cover;">`
        : `<div class="avatar-initials sm">${initial}</div>`;

    const uid = window.__FC_USER_ID__;
    const canDelete = uid && (c.user_id === uid || window.__FC_USER_ROLE__ === 'admin');
    const deleteHtml = canDelete
        ? `<button class="comment-delete-btn" onclick="deleteComment(${c.id}, this)"><i class="fas fa-times"></i></button>`
        : '';

    div.innerHTML = `
        <div class="comment-avatar">${avatarHtml}</div>
        <div style="flex:1;min-width:0">
            <div class="comment-bubble">
                <span class="comment-author">${escapeHtml(c.author_name)}</span>
                <p class="comment-text">${escapeHtml(c.content)}</p>
            </div>
            <div style="display:flex;align-items:center">
                <span class="comment-time">${timeAgo(c.created_at)}</span>
                ${deleteHtml}
            </div>
        </div>`;
    return div;
}

function submitComment(postId, input, article) {
    const content = input.value.trim();
    if (!content) return;
    input.disabled = true;

    fetch(`/community/api/posts/${postId}/comments`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
    })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                input.value = '';
                const list = article.querySelector('[data-comments-list]');
                const placeholder = list.querySelector('div[style*="text-align:center"]');
                if (placeholder) placeholder.remove();
                list.appendChild(createCommentElement(data.comment));
                list.scrollTop = list.scrollHeight;

                const countEl = article.querySelector('[data-comment-count]');
                if (countEl) {
                    const n = parseInt(countEl.textContent) || 0;
                    countEl.textContent = `${n + 1} comment${n + 1 > 1 ? 's' : ''}`;
                }
            }
        })
        .finally(() => { input.disabled = false; input.focus(); });
}

window.deleteComment = function (commentId, btn) {
    Swal.fire({
        title: 'Delete this comment?',
        text: "This action cannot be undone.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e3342f',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Yes, delete it!'
    }).then((result) => {
        if (result.isConfirmed) {
            fetch(`/community/api/comments/${commentId}`, { method: 'DELETE', credentials: 'include' })
                .then(r => r.json())
                .then(data => {
                    if (data.success) {
                        const item = btn.closest('.comment-item');
                        if (item) { item.style.opacity = '0'; setTimeout(() => item.remove(), 200); }
                    }
                });
        }
    });
};

/* ═══════════════════════════════════════════════════════
   PROFILE DROPDOWN & MODAL
   ═══════════════════════════════════════════════════════ */
function initProfileDropdown() {
    const toggle = document.getElementById('profileToggle');
    const dropdown = document.getElementById('profileDropdown');
    if (!toggle || !dropdown) return;

    toggle.addEventListener('click', e => {
        e.stopPropagation();
        dropdown.classList.toggle('active');
    });
    document.addEventListener('click', () => dropdown.classList.remove('active'));
}

function initProfileModal() {
    const openBtn = document.getElementById('viewProfileBtn');
    const modal = document.getElementById('profileModal');
    const closeBtn = document.getElementById('closeProfileModal');
    if (!openBtn || !modal) return;

    openBtn.addEventListener('click', e => {
        e.preventDefault();
        document.getElementById('profileDropdown')?.classList.remove('active');
        modal.classList.add('active');
    });

    closeBtn?.addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('active'); });
}

/* ═══════════════════════════════════════════════════════
   TOPIC SELECTOR (composer)
   ═══════════════════════════════════════════════════════ */
function initTopicSelector() {
    const btn = document.getElementById('topicSelectorBtn');
    const dropdown = document.getElementById('topicDropdown');
    const display = document.getElementById('selectedTopicDisplay');
    const badge = document.getElementById('selectedTopicBadge');
    const clearBtn = document.getElementById('clearTopicBtn');
    if (!btn) return;

    btn.addEventListener('click', e => { e.stopPropagation(); dropdown?.classList.toggle('active'); });

    dropdown?.querySelectorAll('[data-select-topic]').forEach(b => {
        b.addEventListener('click', () => {
            selectedPostTopic = b.dataset.selectTopic;
            if (badge) badge.textContent = `${TOPIC_EMOJI[selectedPostTopic] || ''} ${selectedPostTopic}`;
            if (display) display.style.display = 'flex';
            dropdown.classList.remove('active');
        });
    });

    clearBtn?.addEventListener('click', () => {
        selectedPostTopic = '';
        if (display) display.style.display = 'none';
    });

    document.addEventListener('click', () => dropdown?.classList.remove('active'));
}

/* ═══════════════════════════════════════════════════════
   SIDEBAR NAV & TOPIC FILTER
   ═══════════════════════════════════════════════════════ */
function initSidebarNav() {
    document.querySelectorAll('.sidebar-nav .nav-item[data-filter]').forEach(item => {
        item.addEventListener('click', e => {
            e.preventDefault();
            document.querySelectorAll('.nav-item[data-filter]').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            activeFilter = item.dataset.filter;
            resetAndReload();
        });
    });
}

function initTopicFilter() {
    document.querySelectorAll('.topic-tag[data-topic]').forEach(tag => {
        tag.addEventListener('click', () => {
            document.querySelectorAll('.topic-tag').forEach(t => t.classList.remove('active'));
            tag.classList.add('active');
            activeTopic = tag.dataset.topic;
            resetAndReload();
        });
    });
}

/* ═══════════════════════════════════════════════════════
   SEARCH
   ═══════════════════════════════════════════════════════ */
function initSearch() {
    const input = document.getElementById('searchInput');
    if (!input) return;
    let timeout;
    input.addEventListener('input', () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            searchQuery = input.value.trim();
            resetAndReload();
        }, 400);
    });
}

/* ═══════════════════════════════════════════════════════
   STATS
   ═══════════════════════════════════════════════════════ */
function loadStats() {
    fetch('/community/api/stats', { credentials: 'include' })
        .then(r => r.json())
        .then(data => {
            if (!data.success) return;
            const s = data.stats;
            setText('totalPostsStat', s.total_posts || 0);
            setText('totalMembersStat', s.total_members || 0);
            setText('myPostsCount', s.my_posts || 0);
            setText('myReactionsCount', s.my_reactions || 0);
            setText('myCommentsCount', s.my_comments || 0);
            setText('pmPosts', s.my_posts || 0);
            setText('pmReactions', s.my_reactions || 0);
            setText('pmComments', s.my_comments || 0);
        })
        .catch(() => { });
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

/* ═══════════════════════════════════════════════════════
   CLOSE MENUS
   ═══════════════════════════════════════════════════════ */
function initMenuClose() {
    document.addEventListener('click', () => {
        document.querySelectorAll('.post-menu-dropdown.active').forEach(d => d.classList.remove('active'));
    });
}

/* ═══════════════════════════════════════════════════════
   UTILITIES
   ═══════════════════════════════════════════════════════ */
function timeAgo(iso) {
    if (!iso) return '';
    const d = new Date(iso + (iso.endsWith('Z') ? '' : 'Z'));
    const diff = Math.floor((Date.now() - d) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}
