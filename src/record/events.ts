/** One event shape shared by the world and the record. */
export interface WorldEvent {
  kind: 'seed' | 'placed' | 'removed';
  tick: number;
  text: string;
  status: string;
}
