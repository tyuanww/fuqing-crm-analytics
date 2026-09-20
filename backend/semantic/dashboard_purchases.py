"""Confirmed dashboard numerator; fail closed on incomplete purchase denominators."""
from decimal import Decimal, ROUND_HALF_UP


def average_fen(amount: int, denominator: int, *, unknown: bool, invalid_amount: bool,
                unknown_reason: str) -> dict:
    reason = ('INVALID_AMOUNT' if invalid_amount else unknown_reason if unknown
              else 'NO_PURCHASES' if denominator == 0 else None)
    value = None if reason else int((Decimal(amount) / denominator).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
    return {'amount_fen': value, 'denominator': denominator, 'reason': reason}


def money_fen(amount) -> int:
    value = Decimal(str(amount or 0))
    if not value.is_finite():
        raise ValueError('nonfinite dashboard amount')
    # Match the accepted overview's round(float(sum), 2) before converting to cents.
    return int(Decimal(str(round(float(value), 2))) * 100)
