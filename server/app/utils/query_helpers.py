from flask_login import current_user
from sqlalchemy import or_

def get_muni_filter(model):
    """
    Returns the standard SQLAlchemy filter for filtering by the current
    user's municipality. If the user's municipality is set to Mabitac or Laguna,
    it falls back to allowing variations of Mabitac, Laguna.
    
    Args:
        model: The SQLAlchemy model that has a `municipality` column
               (e.g., Registration, Beneficiary)
               
    Returns:
        SQLAlchemy filter condition
    """
    muni = getattr(current_user, 'municipality', None)
    
    if not muni:
        # Fallback to an impossible condition if municipality is missing but required
        return getattr(model, 'municipality') == 'UNKNOWN_MUNICIPALITY_FALLBACK'
        
    muni_upper = muni.strip().upper()
    
    if muni_upper in ['MABITAC', 'LAGUNA', 'MABITAC, LAGUNA', 'MABITAC LAGUNA']:
        return or_(
            model.municipality.ilike('Mabitac'),
            model.municipality.ilike('Laguna'),
            model.municipality.ilike('Mabitac, Laguna'),
            model.municipality.ilike('%Mabitac%'),
            model.municipality.ilike('%Laguna%'),
            model.municipality == muni
        )
    else:
        return model.municipality == muni
