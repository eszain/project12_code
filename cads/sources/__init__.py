"""CDM source adapters (FR02): where messages come from, decoupled from what we do with them."""

from .base import CDMSource, RetrievalCriteria
from .local import LocalDirectorySource

__all__ = ["CDMSource", "LocalDirectorySource", "RetrievalCriteria"]
