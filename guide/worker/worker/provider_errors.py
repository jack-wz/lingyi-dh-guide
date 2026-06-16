"""Provider error normalization for worker pipelines."""


class ProviderTimeoutError(TimeoutError):
    """Raised when an upstream provider call or async task exceeds its timeout."""

    def __init__(self, provider: str, operation: str, timeout_s: int | float | None = None):
        self.provider = provider
        self.operation = operation
        self.timeout_s = timeout_s
        suffix = f" after {timeout_s}s" if timeout_s else ""
        super().__init__(f"{provider} provider timeout during {operation}{suffix}")


def is_timeout_exception(exc: BaseException) -> bool:
    """Detect timeout exceptions without importing optional provider SDKs."""
    if isinstance(exc, TimeoutError):
        return True
    name = type(exc).__name__.lower()
    module = type(exc).__module__.lower()
    return "timeout" in name or "timeout" in module


def raise_if_timeout(
    provider: str,
    operation: str,
    exc: BaseException,
    timeout_s: int | float | None = None,
) -> None:
    if is_timeout_exception(exc):
        raise ProviderTimeoutError(provider, operation, timeout_s) from exc
