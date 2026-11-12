export type TemporalState = "upcoming" | "occurred";
export type EventStatus = "Open" | "Historical";
export type DataQuality = "Complete" | "Partial" | "Needs review";
export type RiskAssessment = "Not assessed";

export interface CdmRevision {
  id: string;
  createdAt: string;
  tca: string;
  missDistanceM: number;
  relativeSpeedMps: number;
  sourcePc: string;
  dataQuality: DataQuality;
}

export interface ConjunctionEvent {
  id: string;
  primaryObject: string;
  secondaryObject: string;
  secondaryObjectType: "Debris" | "Spacecraft";
  tca: string;
  temporalState: TemporalState;
  timeToTcaLabel?: string;
  firstObserved: string;
  lastUpdated: string;
  status: EventStatus;
  dataQuality: DataQuality;
  reviewStatus: "No review flag" | "Review recommended";
  riskAssessment: RiskAssessment;
  actionability: RiskAssessment;
  missDistanceM: number;
  relativeSpeedMps: number;
  sourcePc: string;
  revisions: CdmRevision[];
}

export const dataSourceLabel = "Demonstration fixtures — not live operational data";
