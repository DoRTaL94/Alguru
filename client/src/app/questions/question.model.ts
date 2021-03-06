import { IVote } from '../forum/vote.model';

export interface IQuestion {
  id: string;
  title: string;
  content: string;
  solutionTemplate: string[];
  solution: string[];
  submitionTests: string[];
  exampleTests: string[];
  hints: string;
  level: number;
  author: string;
  votes: Map<string, IVote>;
}
