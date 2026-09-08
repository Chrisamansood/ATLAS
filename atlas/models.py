from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any


class Outcome(str, Enum):
    ALLOW = "allow"
    QUARANTINE = "quarantine"
    BLOCK = "block"


class Domain(str, Enum):
    INVOICE = "invoice"
    TELECOM = "telecom"


class ActorType(str, Enum):
    TRUSTED_SYSTEM = "trusted_system"
    UNTRUSTED_EXTERNAL = "untrusted_external"
    HUMAN_REVIEWER = "human_reviewer"


class SourceConfidence(str, Enum):
    VERIFIED = "verified"
    PARTIALLY_VERIFIED = "partially_verified"
    UNTRUSTED = "untrusted"


@dataclass(frozen=True)
class Provenance:
    source_id: str
    source_type: str
    actor: ActorType
    received_at: str = ""
    confidence: SourceConfidence = SourceConfidence.UNTRUSTED
    integrity: str = "unverified"
    raw_content_retained: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "source_id": self.source_id,
            "source_type": self.source_type,
            "actor": self.actor.value,
            "received_at": self.received_at,
            "confidence": self.confidence.value,
            "integrity": self.integrity,
        }


Source = Provenance


@dataclass(frozen=True)
class ActionRequest:
    request_id: str
    domain: Domain
    intent: str
    target: str
    parameters: dict[str, Any] = field(default_factory=dict)
    evidence: dict[str, Any] = field(default_factory=dict)
    declared_scope: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return {
            "request_id": self.request_id,
            "domain": self.domain.value,
            "intent": self.intent,
            "target": self.target,
            "parameters": self.parameters,
            "evidence": self.evidence,
            "declared_scope": list(self.declared_scope),
        }


ProposedAction = ActionRequest


@dataclass(frozen=True)
class Scenario:
    scenario_id: str
    source: Provenance
    content_summary: str
    proposed_action: ActionRequest
    expected_decision: str
    expected_rules: tuple[str, ...] = ()


@dataclass(frozen=True)
class ReviewDecision:
    review_id: str
    reviewer: str
    request_id: str
    approved: bool
    recorded_at: str
    reason: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
