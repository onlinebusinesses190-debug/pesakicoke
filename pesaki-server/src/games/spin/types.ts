export interface AllocationOutcome {
  id: string;
  name: string;
  value: number;
  weight: number;
}

export interface AllocationResult {
  userId: string;
  allocationAmount: number;
  outcomeId: string;
  outcomeValue: number;
  mode: 'real' | 'demo';
  timestamp: Date;
}
