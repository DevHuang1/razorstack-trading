"""Data-quality checks for quant bars before a signal is considered actionable."""
from collections import Counter
from datetime import datetime, timedelta, timezone

from app.schemas.quant import DataQualityMetadata, OHLCVBar

TIMEFRAME_SECONDS: dict[str, int] = {
    "1Min": 60,
    "5Min": 5 * 60,
    "15Min": 15 * 60,
    "30Min": 30 * 60,
    "1Hour": 60 * 60,
    "1Day": 24 * 60 * 60,
    "1Week": 7 * 24 * 60 * 60,
}


def assess_data_quality(
    *,
    symbol: str,
    timeframe: str,
    bars: list[OHLCVBar],
    as_of: datetime | None = None,
    min_history_bars: int = 60,
    max_gap_bars: int = 3,
    stale_after_intervals: int = 3,
) -> DataQualityMetadata:
    """Return quality metadata without mutating or rejecting the supplied bars."""
    interval = TIMEFRAME_SECONDS.get(timeframe)
    ordered = sorted(bars, key=lambda bar: bar.t)
    counts = Counter(bar.t for bar in ordered)
    duplicate_count = sum(count - 1 for count in counts.values() if count > 1)
    unique = sorted(counts)

    missing_count = 0
    largest_gap = 0
    if interval and len(unique) > 1:
        for previous, current in zip(unique, unique[1:]):
            if timeframe == "1Day":
                cursor = previous
                gap_bars = 0
                while cursor.date() < current.date():
                    cursor = cursor.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
                    if cursor.weekday() < 5 and cursor.date() < current.date():
                        gap_bars += 1
            else:
                elapsed = (current - previous).total_seconds()
                gap_bars = max(0, round(elapsed / interval) - 1)
            missing_count += gap_bars
            largest_gap = max(largest_gap, gap_bars)

    warnings: list[str] = []
    if len(unique) < min_history_bars:
        warnings.append(f"history_short:{len(unique)}<{min_history_bars}")
    if duplicate_count:
        warnings.append(f"duplicate_bars:{duplicate_count}")
    if largest_gap > max_gap_bars:
        warnings.append(f"gap_too_large:{largest_gap}>{max_gap_bars}")

    first_bar_at = ordered[0].t if ordered else None
    last_bar_at = ordered[-1].t if ordered else None
    reference_time = as_of or datetime.now(timezone.utc)
    if reference_time.tzinfo is None:
        reference_time = reference_time.replace(tzinfo=timezone.utc)
    stale = False
    if interval and last_bar_at is not None:
        last_time = last_bar_at
        if last_time.tzinfo is None:
            last_time = last_time.replace(tzinfo=timezone.utc)
        stale = (reference_time - last_time).total_seconds() > interval * stale_after_intervals
        if stale:
            warnings.append("stale_last_bar")

    return DataQualityMetadata(
        symbol=symbol.upper(),
        timeframe=timeframe,
        bar_count=len(unique),
        first_bar_at=first_bar_at,
        last_bar_at=last_bar_at,
        expected_interval_seconds=interval,
        duplicate_bar_count=duplicate_count,
        missing_bar_count=missing_count,
        max_gap_bars=largest_gap,
        stale=stale,
        is_actionable=not warnings,
        warnings=warnings,
    )
