"""
Farm Connect - Community Models
Social feed: posts, reactions, comments
"""

from app.extensions import db
from datetime import datetime


class CommunityPost(db.Model):
    __tablename__ = 'community_posts'

    id            = db.Column(db.Integer, primary_key=True)
    user_id       = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    author_name   = db.Column(db.String(100), nullable=False, default='Community Member')
    author_avatar = db.Column(db.String(500), nullable=True)
    content       = db.Column(db.Text, nullable=False)
    image_url     = db.Column(db.String(500), nullable=True)
    topic         = db.Column(db.String(50), nullable=True)
    is_pinned     = db.Column(db.Boolean, default=False)
    created_at    = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at    = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user      = db.relationship('User', backref='community_posts', lazy=True)
    reactions = db.relationship('PostReaction', backref='post', lazy='dynamic', cascade='all, delete-orphan')
    comments  = db.relationship('PostComment', backref='post', lazy='dynamic', cascade='all, delete-orphan')

    def to_dict(self, current_user_id=None):
        """Serialize post for API response."""
        reaction_counts = {}
        user_reaction = None
        for r in self.reactions:
            reaction_counts[r.type] = reaction_counts.get(r.type, 0) + 1
            # Find current user's reaction in-memory (avoids N+1 query)
            if current_user_id and r.user_id == current_user_id:
                user_reaction = r.type

        return {
            'id': self.id,
            'user_id': self.user_id,
            'author_name': self.user.full_name if self.user and self.user.full_name else self.author_name,
            'author_avatar': self.user.avatar_url if self.user and hasattr(self.user, 'avatar_url') and self.user.avatar_url else None,
            'author_role': self.user.role if self.user else None,
            'content': self.content,
            'image_url': self.image_url,
            'topic': self.topic,
            'is_pinned': self.is_pinned,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'reaction_counts': reaction_counts,
            'total_reactions': sum(reaction_counts.values()),
            'user_reaction': user_reaction,
            'comment_count': self.comments.count(),
        }


class PostReaction(db.Model):
    __tablename__ = 'post_reactions'

    id         = db.Column(db.Integer, primary_key=True)
    post_id    = db.Column(db.Integer, db.ForeignKey('community_posts.id', ondelete='CASCADE'), nullable=False)
    user_id    = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    type       = db.Column(db.String(20), nullable=False, default='like')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('post_id', 'user_id', name='uq_post_user_reaction'),
    )


class PostComment(db.Model):
    __tablename__ = 'post_comments'

    id          = db.Column(db.Integer, primary_key=True)
    post_id     = db.Column(db.Integer, db.ForeignKey('community_posts.id', ondelete='CASCADE'), nullable=False)
    user_id     = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    author_name = db.Column(db.String(100), nullable=False, default='Community Member')
    content     = db.Column(db.Text, nullable=False)
    created_at  = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship('User', backref='post_comments', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'post_id': self.post_id,
            'user_id': self.user_id,
            'author_name': self.user.full_name if self.user and self.user.full_name else self.author_name,
            'author_avatar': self.user.avatar_url if self.user and hasattr(self.user, 'avatar_url') and self.user.avatar_url else None,
            'author_role': self.user.role if self.user else None,
            'content': self.content,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
