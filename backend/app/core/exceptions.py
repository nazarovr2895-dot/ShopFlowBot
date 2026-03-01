"""
Unified base exception classes for all services.

Each service extends ServiceError with its own base (e.g. OrderServiceError)
so that existing `except OrderServiceError` handlers continue to work.
"""


class ServiceError(Exception):
    """Base exception for all service-layer errors."""

    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)
