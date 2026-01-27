"""
Structured logging configuration using structlog.

Provides JSON-formatted structured logs for production use.
"""
import logging
import sys
import structlog
from typing import Any


def setup_logging(log_level: str = "INFO", json_format: bool = True) -> None:
    """
    Configure structlog for structured logging.
    
    Args:
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR)
        json_format: If True, output JSON format (for production).
                     If False, output human-readable format (for development).
    """
    # Set up standard library logging
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, log_level.upper(), logging.INFO),
    )
    
    # Shared processors for both development and production
    shared_processors: list[Any] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
    ]
    
    if json_format:
        # Production: JSON output
        processors = shared_processors + [
            structlog.processors.JSONRenderer()
        ]
    else:
        # Development: colored, human-readable output
        processors = shared_processors + [
            structlog.dev.ConsoleRenderer(colors=True)
        ]
    
    structlog.configure(
        processors=processors,
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str = __name__) -> structlog.stdlib.BoundLogger:
    """
    Get a structured logger instance.
    
    Args:
        name: Logger name (usually __name__ of the module)
    
    Returns:
        Configured structlog logger
    """
    return structlog.get_logger(name)


# Pre-configured logger for convenience
logger = structlog.get_logger()
