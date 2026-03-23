-- =============================================
-- FARM CONNECT — Community Social Feed Tables
-- Safe to run multiple times (IF NOT EXISTS)
-- =============================================

-- 1. Community Posts
CREATE TABLE IF NOT EXISTS community_posts (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT NULL,
    author_name VARCHAR(100) NOT NULL DEFAULT 'Community Member',
    author_avatar VARCHAR(500) NULL,
    content     TEXT NOT NULL,
    image_url   VARCHAR(500) NULL,
    topic       VARCHAR(50) NULL,
    is_pinned   BOOLEAN DEFAULT FALSE,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 2. Post Reactions (one reaction per user per post)
CREATE TABLE IF NOT EXISTS post_reactions (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    post_id     INT NOT NULL,
    user_id     INT NOT NULL,
    type        VARCHAR(20) NOT NULL DEFAULT 'like',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uq_post_user_reaction (post_id, user_id)
);

-- 3. Post Comments
CREATE TABLE IF NOT EXISTS post_comments (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    post_id     INT NOT NULL,
    user_id     INT NULL,
    author_name VARCHAR(100) NOT NULL DEFAULT 'Community Member',
    content     TEXT NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCAD E,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX idx_community_posts_user ON community_posts(user_id);
CREATE INDEX idx_community_posts_pinned ON community_posts(is_pinned, created_at);
CREATE INDEX idx_post_reactions_post ON post_reactions(post_id);
CREATE INDEX idx_post_comments_post ON post_comments(post_id);
