"""
Farm Connect - Community Routes
Facebook-like social feed: posts, reactions, comments
"""

from flask import Blueprint, render_template, request, jsonify, current_app
from flask_login import current_user, login_required
from app.extensions import db, csrf
from app.models.community import CommunityPost, PostReaction, PostComment
from app.models.user import User
from sqlalchemy import func
from datetime import datetime

community_bp = Blueprint('community', __name__)


# ──────────────────────────────────────────────────────────
# PAGE
# ──────────────────────────────────────────────────────────
@community_bp.route('/')
def feed_page():
    """Render the community feed page."""
    return render_template('community/community.html')


@community_bp.route('/login')
def community_login():
    """Render the community login page (public users)."""
    return render_template('auth/community-login.html')


# ──────────────────────────────────────────────────────────
# POSTS API
# ──────────────────────────────────────────────────────────
@community_bp.route('/api/posts')
def get_posts():
    """Fetch paginated community posts with filtering, search, and sorting."""
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 15, type=int)
    per_page = min(per_page, 50)
    sort = request.args.get('sort', '')
    topic = request.args.get('topic', '')
    filter_type = request.args.get('filter', '')
    search_q = request.args.get('q', '').strip()

    uid = current_user.id if current_user.is_authenticated else None

    query = CommunityPost.query

    # Filters
    if filter_type == 'mine' and uid:
        query = query.filter(CommunityPost.user_id == uid)
    if topic:
        query = query.filter(CommunityPost.topic == topic)
    if search_q:
        query = query.filter(CommunityPost.content.ilike(f'%{search_q}%'))

    # Sorting
    query = query.order_by(
        CommunityPost.is_pinned.desc(),
        CommunityPost.created_at.desc()
    )

    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        'success': True,
        'posts': [p.to_dict(current_user_id=uid) for p in pagination.items],
        'has_next': pagination.has_next,
        'page': page,
        'total': pagination.total,
    })


@community_bp.route('/api/posts', methods=['POST'])
@csrf.exempt
@login_required
def create_post():
    """Create a new community post."""
    data = request.get_json(force=True) or {}
    content = (data.get('content') or '').strip()

    if not content:
        return jsonify({'success': False, 'message': 'Post content is required.'}), 400

    if len(content) > 5000:
        return jsonify({'success': False, 'message': 'Post content is too long (max 5000 characters).'}), 400

    topic = (data.get('topic') or '').strip().lower()
    valid_topics = {'crops', 'livestock', 'fishery', 'market', 'tips', 'events', 'general'}

    post = CommunityPost(
        user_id=current_user.id,
        author_name=current_user.full_name or current_user.username,
        author_avatar=getattr(current_user, 'avatar_url', None),
        content=content,
        image_url=data.get('image_url'),
        topic=topic if topic in valid_topics else None,
    )
    db.session.add(post)
    db.session.commit()

    return jsonify({
        'success': True,
        'post': post.to_dict(current_user_id=current_user.id),
    }), 201


@community_bp.route('/api/posts/<int:post_id>', methods=['DELETE'])
@csrf.exempt
@login_required
def delete_post(post_id):
    """Delete own post (or admin can delete any)."""
    post = CommunityPost.query.get_or_404(post_id)

    if post.user_id != current_user.id and current_user.role != 'admin':
        return jsonify({'success': False, 'message': 'Unauthorized.'}), 403

    db.session.delete(post)
    db.session.commit()
    return jsonify({'success': True})


# ──────────────────────────────────────────────────────────
# REACTIONS API
# ──────────────────────────────────────────────────────────
ALLOWED_REACTIONS = {'like', 'love', 'haha', 'wow', 'sad', 'angry'}


@community_bp.route('/api/posts/<int:post_id>/react', methods=['POST'])
@csrf.exempt
@login_required
def toggle_reaction(post_id):
    """Toggle a reaction on a post. Same type again = remove."""
    post = CommunityPost.query.get_or_404(post_id)
    data = request.get_json(force=True) or {}
    reaction_type = (data.get('type') or 'like').lower()

    if reaction_type not in ALLOWED_REACTIONS:
        return jsonify({'success': False, 'message': 'Invalid reaction type.'}), 400

    existing = PostReaction.query.filter_by(
        post_id=post_id, user_id=current_user.id
    ).first()

    if existing:
        if existing.type == reaction_type:
            # Same reaction → remove it (toggle off)
            db.session.delete(existing)
            db.session.commit()
            return jsonify({
                'success': True,
                'action': 'removed',
                'post': post.to_dict(current_user_id=current_user.id),
            })
        else:
            # Different reaction → update
            existing.type = reaction_type
            db.session.commit()
            return jsonify({
                'success': True,
                'action': 'changed',
                'post': post.to_dict(current_user_id=current_user.id),
            })
    else:
        # New reaction
        reaction = PostReaction(
            post_id=post_id,
            user_id=current_user.id,
            type=reaction_type,
        )
        db.session.add(reaction)
        db.session.commit()
        return jsonify({
            'success': True,
            'action': 'added',
            'post': post.to_dict(current_user_id=current_user.id),
        })


# ──────────────────────────────────────────────────────────
# COMMENTS API
# ──────────────────────────────────────────────────────────
@community_bp.route('/api/posts/<int:post_id>/comments')
def get_comments(post_id):
    """Fetch all comments for a post."""
    CommunityPost.query.get_or_404(post_id)

    comments = PostComment.query.filter_by(post_id=post_id) \
        .order_by(PostComment.created_at.asc()).all()

    return jsonify({
        'success': True,
        'comments': [c.to_dict() for c in comments],
    })


@community_bp.route('/api/posts/<int:post_id>/comments', methods=['POST'])
@csrf.exempt
@login_required
def add_comment(post_id):
    """Add a comment to a post."""
    CommunityPost.query.get_or_404(post_id)
    data = request.get_json(force=True) or {}
    content = (data.get('content') or '').strip()

    if not content:
        return jsonify({'success': False, 'message': 'Comment cannot be empty.'}), 400

    if len(content) > 2000:
        return jsonify({'success': False, 'message': 'Comment is too long (max 2000 characters).'}), 400

    comment = PostComment(
        post_id=post_id,
        user_id=current_user.id,
        author_name=current_user.full_name or current_user.username,
        content=content,
    )
    db.session.add(comment)
    db.session.commit()

    return jsonify({
        'success': True,
        'comment': comment.to_dict(),
    }), 201


@community_bp.route('/api/comments/<int:comment_id>', methods=['DELETE'])
@csrf.exempt
@login_required
def delete_comment(comment_id):
    """Delete own comment (or admin can delete any)."""
    comment = PostComment.query.get_or_404(comment_id)

    if comment.user_id != current_user.id and current_user.role != 'admin':
        return jsonify({'success': False, 'message': 'Unauthorized.'}), 403

    db.session.delete(comment)
    db.session.commit()
    return jsonify({'success': True})


# ──────────────────────────────────────────────────────────
# STATS API
# ──────────────────────────────────────────────────────────
@community_bp.route('/api/stats')
def get_stats():
    """Community and user activity stats."""
    total_posts = CommunityPost.query.count()
    total_members = db.session.query(func.count(func.distinct(CommunityPost.user_id))).scalar() or 0

    my_posts = 0
    my_reactions = 0
    my_comments = 0

    if current_user.is_authenticated:
        uid = current_user.id
        my_posts = CommunityPost.query.filter_by(user_id=uid).count()
        my_reactions = PostReaction.query.filter_by(user_id=uid).count()
        my_comments = PostComment.query.filter_by(user_id=uid).count()

    return jsonify({
        'success': True,
        'stats': {
            'total_posts': total_posts,
            'total_members': total_members,
            'my_posts': my_posts,
            'my_reactions': my_reactions,
            'my_comments': my_comments,
        }
    })
