"""Ground-deformation indicators.

Sentinel-1 style deformation is an input feature. A high value raises landslide
susceptibility. It does not, by itself, mean a landslide is imminent.
"""


def deformation_note(value: float) -> str:
    if value >= 0.40:
        return (
            "Deformation indicator is elevated. The model treats it as one "
            "contributing factor, not as proof of an imminent landslide."
        )
    if value >= 0.25:
        return "Deformation indicator is weak and is not used as a standalone signal."
    return "No meaningful deformation indicator is present in this scenario."
