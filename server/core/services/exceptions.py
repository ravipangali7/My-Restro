class ServiceError(Exception):
    """Base class for domain/service-layer errors."""


class InsufficientStockError(ServiceError):
    def __init__(self, raw_material_name: str, needed, available):
        self.raw_material_name = raw_material_name
        self.needed = needed
        self.available = available
        super().__init__(
            f"Insufficient stock for {raw_material_name}: need {needed}, have {available}"
        )


class AlreadyPostedError(ServiceError):
    """Raised when a purchase or similar operation was already applied."""


class ValidationError(ServiceError):
    """Raised when input breaks business rules."""
