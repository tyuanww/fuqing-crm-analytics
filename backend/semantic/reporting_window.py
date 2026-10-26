from calendar import monthrange
from datetime import date


def warehouse_window_allowed(start: date, end: date) -> bool:
    if not 2000 <= start.year <= end.year <= 2099 or end < start:
        return False
    if (end - start).days < 90:
        return True
    months = end.month - start.month + 1
    return (start.year == end.year and start.day == 1
            and end.day == monthrange(end.year, end.month)[1]
            and ((months == 3 and (start.month - 1) % 3 == 0)
                 or (months == 6 and (start.month - 1) % 6 == 0)))
