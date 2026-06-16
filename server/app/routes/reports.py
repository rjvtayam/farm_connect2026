"""
Farm Connect - Report Generation
PDF reports for MAO, Admin, and Encoder dashboards.
Uses ReportLab for branded PDF generation.
"""

import io
import json
from datetime import datetime, timedelta
from flask import Blueprint, jsonify, request, send_file, current_app
from flask_login import current_user
from reportlab.lib.pagesizes import A4, letter
from reportlab.lib import colors
from reportlab.lib.units import inch, mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT

from app.extensions import db, cache
from app.models.registration import Registration, Beneficiary
from app.models.user import User
from app.routes.auth import mao_required, admin_required, encoder_required

reports_bp = Blueprint('reports', __name__)


def _get_muni_filter(muni):
    """Build municipality filter clause."""
    return db.or_(
        Beneficiary.municipality.ilike(f'%{muni}%'),
        Beneficiary.municipality.ilike('%Laguna%') if muni.lower() == 'mabitac' else False
    )


def _build_styles():
    """Build custom ReportLab styles."""
    styles = getSampleStyleSheet()

    styles.add(ParagraphStyle(
        name='ReportTitle',
        parent=styles['Title'],
        fontSize=18,
        spaceAfter=6,
        textColor=colors.HexColor('#1e3a5f'),
    ))
    styles.add(ParagraphStyle(
        name='ReportSubtitle',
        parent=styles['Normal'],
        fontSize=11,
        textColor=colors.HexColor('#6b7280'),
        spaceAfter=12,
        alignment=TA_CENTER,
    ))
    styles.add(ParagraphStyle(
        name='SectionHeader',
        parent=styles['Heading2'],
        fontSize=13,
        textColor=colors.HexColor('#1e3a5f'),
        spaceBefore=16,
        spaceAfter=8,
    ))
    styles.add(ParagraphStyle(
        name='FooterNote',
        parent=styles['Normal'],
        fontSize=8,
        textColor=colors.HexColor('#9ca3af'),
        alignment=TA_CENTER,
    ))
    return styles


def _make_table(data, col_widths=None):
    """Create a styled table."""
    if not col_widths:
        col_widths = [200, 100]
    t = Table(data, colWidths=col_widths)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e3a5f')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f3f4f6')]),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#d1d5db')),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    return t


# ─────────────────────────────────────────────────────────────────────────────
# MAO Summary Report
# ─────────────────────────────────────────────────────────────────────────────

@reports_bp.route('/mao/summary', methods=['GET'])
@mao_required
def mao_summary_report():
    """Generate MAO summary PDF report with registration stats."""
    muni = current_user.municipality
    muni_filter = _get_muni_filter(muni)

    # Gather stats
    base = Registration.query.join(Beneficiary).filter(muni_filter, Registration.is_deleted == False)
    total = base.count()
    approved = base.filter(Registration.status == 'approved').count()
    verified = base.filter(Registration.status == 'verified').count()
    pending = base.filter(Registration.status == 'pending').count()
    rejected = base.filter(Registration.status == 'rejected').count()

    # By form type
    rsbsa = base.filter(Registration.form_type == 'rsbsa').count()
    fish = base.filter(Registration.form_type == 'fish').count()
    boat = base.filter(Registration.form_type == 'boat').count()
    ncfrs = base.filter(Registration.form_type == 'ncfrs').count()

    # Approved beneficiaries
    approved_count = Beneficiary.query.join(Registration).filter(
        muni_filter, Registration.status == 'approved'
    ).distinct().count()

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=30, bottomMargin=30)
    styles = _build_styles()
    elements = []

    # Title
    elements.append(Paragraph("RSBSA Registration Summary Report", styles['ReportTitle']))
    elements.append(Paragraph(f"Municipality: {muni} | Generated: {datetime.utcnow().strftime('%B %d, %Y %H:%M UTC')}", styles['ReportSubtitle']))
    elements.append(HRFlowable(width='100%', thickness=1, color=colors.HexColor('#d1d5db')))
    elements.append(Spacer(1, 12))

    # Overview
    elements.append(Paragraph("Registration Overview", styles['SectionHeader']))
    overview_data = [
        ['Metric', 'Count'],
        ['Total Registrations', str(total)],
        ['Approved', str(approved)],
        ['Pending Verification', str(pending)],
        ['Pending Approval (Verified)', str(verified)],
        ['Rejected', str(rejected)],
        ['Unique Beneficiaries (Approved)', str(approved_count)],
    ]
    elements.append(_make_table(overview_data))
    elements.append(Spacer(1, 16))

    # By Form Type
    elements.append(Paragraph("Registrations by Form Type", styles['SectionHeader']))
    type_data = [
        ['Form Type', 'Count'],
        ['RSBSA Enrollment', str(rsbsa)],
        ['Fish Registration', str(fish)],
        ['Boat Registration', str(boat)],
        ['NCFRS Enrollment', str(ncfrs)],
    ]
    elements.append(_make_table(type_data))
    elements.append(Spacer(1, 16))

    # Footer
    elements.append(Spacer(1, 20))
    elements.append(HRFlowable(width='100%', thickness=0.5, color=colors.HexColor('#d1d5db')))
    elements.append(Paragraph(f"Farm Connect 2026 — {muni} Municipal Agriculture Office", styles['FooterNote']))

    doc.build(elements)
    buffer.seek(0)
    return send_file(
        buffer,
        mimetype='application/pdf',
        as_attachment=True,
        download_name=f'MAO_Summary_{muni}_{datetime.utcnow().strftime("%Y%m%d")}.pdf'
    )


# ─────────────────────────────────────────────────────────────────────────────
# Barangay Comparison Report
# ─────────────────────────────────────────────────────────────────────────────

@reports_bp.route('/mao/barangay', methods=['GET'])
@mao_required
def mao_barangay_report():
    """Generate barangay-level comparison PDF report."""
    from sqlalchemy import func

    muni = current_user.municipality
    muni_filter = _get_muni_filter(muni)

    # Get registration counts per barangay
    barangay_stats = db.session.query(
        Beneficiary.barangay,
        func.count(Registration.id).label('total'),
        func.count(db.case((Registration.status == 'approved', 1))).label('approved'),
        func.count(db.case((Registration.status == 'pending', 1))).label('pending'),
        func.count(db.case((Registration.status == 'rejected', 1))).label('rejected'),
    ).join(Registration).filter(
        muni_filter, Registration.is_deleted == False
    ).group_by(Beneficiary.barangay).order_by(
        func.count(Registration.id).desc()
    ).all()

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=30, bottomMargin=30)
    styles = _build_styles()
    elements = []

    elements.append(Paragraph("Barangay Registration Comparison", styles['ReportTitle']))
    elements.append(Paragraph(f"Municipality: {muni} | Generated: {datetime.utcnow().strftime('%B %d, %Y %H:%M UTC')}", styles['ReportSubtitle']))
    elements.append(HRFlowable(width='100%', thickness=1, color=colors.HexColor('#d1d5db')))
    elements.append(Spacer(1, 12))

    if barangay_stats:
        table_data = [['Barangay', 'Total', 'Approved', 'Pending', 'Rejected']]
        for row in barangay_stats:
            table_data.append([
                row.barangay or 'Unknown',
                str(row.total),
                str(row.approved),
                str(row.pending),
                str(row.rejected),
            ])

        t = Table(table_data, colWidths=[160, 70, 80, 80, 80])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e3a5f')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f3f4f6')]),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#d1d5db')),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        elements.append(t)
    else:
        elements.append(Paragraph("No registration data found for this municipality.", styles['Normal']))

    elements.append(Spacer(1, 20))
    elements.append(HRFlowable(width='100%', thickness=0.5, color=colors.HexColor('#d1d5db')))
    elements.append(Paragraph(f"Farm Connect 2026 — {muni} Municipal Agriculture Office", styles['FooterNote']))

    doc.build(elements)
    buffer.seek(0)
    return send_file(
        buffer,
        mimetype='application/pdf',
        as_attachment=True,
        download_name=f'Barangay_Report_{muni}_{datetime.utcnow().strftime("%Y%m%d")}.pdf'
    )


# ─────────────────────────────────────────────────────────────────────────────
# Admin System Report
# ─────────────────────────────────────────────────────────────────────────────

@reports_bp.route('/admin/system', methods=['GET'])
@admin_required
def admin_system_report():
    """Generate admin system overview PDF report."""
    from sqlalchemy import func

    muni = current_user.municipality

    # User counts by role
    role_stats = db.session.query(
        User.role,
        func.count(User.id).label('count')
    ).filter(
        User.municipality == muni,
        User.is_active == True
    ).group_by(User.role).all()

    # Registration stats
    muni_filter = _get_muni_filter(muni)
    total_reg = Registration.query.join(Beneficiary).filter(muni_filter, Registration.is_deleted == False).count()
    approved_reg = Registration.query.join(Beneficiary).filter(muni_filter, Registration.status == 'approved', Registration.is_deleted == False).count()
    total_beneficiaries = Beneficiary.query.filter(
        Beneficiary.municipality.ilike(f'%{muni}%')
    ).count()

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=30, bottomMargin=30)
    styles = _build_styles()
    elements = []

    elements.append(Paragraph("System Overview Report", styles['ReportTitle']))
    elements.append(Paragraph(f"Municipality: {muni} | Generated: {datetime.utcnow().strftime('%B %d, %Y %H:%M UTC')}", styles['ReportSubtitle']))
    elements.append(HRFlowable(width='100%', thickness=1, color=colors.HexColor('#d1d5db')))
    elements.append(Spacer(1, 12))

    # Staff Summary
    elements.append(Paragraph("Staff Summary", styles['SectionHeader']))
    role_data = [['Role', 'Active Users']]
    role_map = {'admin': 'Administrators', 'mao': 'MAO Officers', 'encoder': 'Encoders', 'verifier': 'Verifiers'}
    for row in role_stats:
        role_data.append([role_map.get(row.role, row.role.title()), str(row.count)])
    if len(role_data) > 1:
        elements.append(_make_table(role_data))
    else:
        elements.append(Paragraph("No active staff found.", styles['Normal']))

    elements.append(Spacer(1, 12))

    # Registration Summary
    elements.append(Paragraph("Registration Summary", styles['SectionHeader']))
    reg_data = [
        ['Metric', 'Count'],
        ['Total Beneficiaries', str(total_beneficiaries)],
        ['Total Registrations', str(total_reg)],
        ['Approved Registrations', str(approved_reg)],
    ]
    elements.append(_make_table(reg_data))

    elements.append(Spacer(1, 20))
    elements.append(HRFlowable(width='100%', thickness=0.5, color=colors.HexColor('#d1d5db')))
    elements.append(Paragraph(f"Farm Connect 2026 — {muni} Municipal Agriculture Office", styles['FooterNote']))

    doc.build(elements)
    buffer.seek(0)
    return send_file(
        buffer,
        mimetype='application/pdf',
        as_attachment=True,
        download_name=f'System_Report_{muni}_{datetime.utcnow().strftime("%Y%m%d")}.pdf'
    )


# ─────────────────────────────────────────────────────────────────────────────
# Encoder Productivity Report
# ─────────────────────────────────────────────────────────────────────────────

@reports_bp.route('/encoder/productivity', methods=['GET'])
@encoder_required
def encoder_productivity_report():
    """Generate encoder personal productivity PDF report."""
    from sqlalchemy import func

    user_id = current_user.id
    muni = current_user.municipality

    # Personal stats
    base = Registration.query.filter(Registration.encoded_by == user_id, Registration.is_deleted == False)
    total = base.count()
    approved = base.filter(Registration.status == 'approved').count()
    pending = base.filter(Registration.status == 'pending').count()
    rejected = base.filter(Registration.status == 'rejected').count()

    # By form type
    type_stats = db.session.query(
        Registration.form_type,
        func.count(Registration.id).label('count')
    ).filter(
        Registration.encoded_by == user_id,
        Registration.is_deleted == False
    ).group_by(Registration.form_type).all()

    # Last 30 days trend
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    recent_total = base.filter(Registration.created_at >= thirty_days_ago).count()

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=30, bottomMargin=30)
    styles = _build_styles()
    elements = []

    elements.append(Paragraph("Encoder Productivity Report", styles['ReportTitle']))
    elements.append(Paragraph(f"Encoder: {current_user.full_name} | Generated: {datetime.utcnow().strftime('%B %d, %Y %H:%M UTC')}", styles['ReportSubtitle']))
    elements.append(HRFlowable(width='100%', thickness=1, color=colors.HexColor('#d1d5db')))
    elements.append(Spacer(1, 12))

    elements.append(Paragraph("Personal Summary", styles['SectionHeader']))
    stats_data = [
        ['Metric', 'Count'],
        ['Total Submissions', str(total)],
        ['Approved', str(approved)],
        ['Pending', str(pending)],
        ['Rejected', str(rejected)],
        ['Last 30 Days', str(recent_total)],
    ]
    elements.append(_make_table(stats_data))
    elements.append(Spacer(1, 12))

    if type_stats:
        elements.append(Paragraph("By Form Type", styles['SectionHeader']))
        type_data = [['Form Type', 'Count']]
        for row in type_stats:
            type_data.append([row.form_type.upper() if row.form_type else 'Unknown', str(row.count)])
        elements.append(_make_table(type_data))

    elements.append(Spacer(1, 20))
    elements.append(HRFlowable(width='100%', thickness=0.5, color=colors.HexColor('#d1d5db')))
    elements.append(Paragraph(f"Farm Connect 2026 — {muni} Municipal Agriculture Office", styles['FooterNote']))

    doc.build(elements)
    buffer.seek(0)
    return send_file(
        buffer,
        mimetype='application/pdf',
        as_attachment=True,
        download_name=f'Encoder_Report_{current_user.full_name.replace(" ", "_")}_{datetime.utcnow().strftime("%Y%m%d")}.pdf'
    )
