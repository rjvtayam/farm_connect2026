"""
Farm Connect - Beneficiary Helpers
Shared deduplication logic for beneficiary creation across all routes.
"""

from app.extensions import db
from app.models.registration import Beneficiary
import logging

logger = logging.getLogger(__name__)


def _clean_name(val):
    """Clean name input: strip whitespace and convert 'None' or empty to None."""
    if not val:
        return None
    s = str(val).strip()
    if s.lower() == 'none' or not s:
        return None
    return s


def upsert_beneficiary(first_name, last_name, date_of_birth, extra_fields: dict) -> Beneficiary:
    """
    Find an existing beneficiary by (first_name, last_name, date_of_birth) or create new.
    If found, updates extra_fields on the existing record.
    Returns Beneficiary instance (with id populated via flush).

    Args:
        first_name: Beneficiary first name
        last_name: Beneficiary last name
        date_of_birth: Date of birth (datetime.date or None)
        extra_fields: Dict of {column_name: value} to set on the beneficiary
    """
    first_name = _clean_name(first_name)
    last_name = _clean_name(last_name)

    bene = Beneficiary.query.filter_by(
        first_name=first_name,
        last_name=last_name,
        date_of_birth=date_of_birth,
    ).first()

    is_new = bene is None

    if is_new:
        bene = Beneficiary(
            first_name=first_name,
            last_name=last_name,
            date_of_birth=date_of_birth,
        )
        db.session.add(bene)
        logger.debug(f"Creating new beneficiary: {first_name} {last_name}")
    else:
        logger.debug(f"Updating existing beneficiary #{bene.id}: {first_name} {last_name}")

    # Apply / update extra fields
    for col, val in extra_fields.items():
        if hasattr(bene, col):
            if col in ['middle_name', 'extension_name']:
                val = _clean_name(val)
            setattr(bene, col, val)

    db.session.flush()  # gives bene.id without committing yet
    return bene


def find_duplicate_beneficiary(first_name, last_name, date_of_birth, municipality=None):
    """
    Check if a beneficiary with matching name + DOB already exists.
    Returns existing Beneficiary or None.
    Used by encoder panel to warn about duplicates before submission.
    """
    first_name = _clean_name(first_name)
    last_name = _clean_name(last_name)

    query = Beneficiary.query.filter_by(
        first_name=first_name,
        last_name=last_name,
        date_of_birth=date_of_birth,
    )

    if municipality:
        query = query.filter(Beneficiary.municipality.ilike(f'%{municipality}%'))

    return query.first()
