import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, Subject } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { IVote } from '../forum/vote.model';
import { IExecution } from './execution.model';
import { IQuestion } from './question.model';

const BACKEND_URL = environment.apiUrl + '/questions';

@Injectable({ providedIn: 'root' })
export class QuestionsService {
  private questions: IQuestion[] = [];
  private question: IQuestion;
  private questionsUpdated = new Subject<IQuestion[]>();
  private executionUpdated = new Subject<IExecution>();
  private questionUpdated = new Subject<IQuestion>();

  constructor(private http: HttpClient, private router: Router) {}

  public vote(id: string, username: string, isUp: boolean, message: string) {
    this.http
      .patch<{ votes }>(BACKEND_URL + '/' + id, { username, isUp, message })
      .subscribe((response) => {
        if (this.question) {
          this.question.votes.set(username, { id: response.votes[username]._id, username, isUp, message });
          this.questionUpdated.next(this.question);
        }
      });
  }

  public getQuestionUpdatedListener(): Observable<IQuestion> {
    return this.questionUpdated.asObservable();
  }

  public updateExecution(execution: IExecution) {
    this.executionUpdated.next(execution);
  }

  public getExecutionUpdatedListener(): Observable<IExecution> {
    return this.executionUpdated.asObservable();
  }

  public getQuestions() {
    this.http
      .get<any>(BACKEND_URL)
      .pipe(
        map((questionsData) => {
          return questionsData.map((question) => {
            return {
              content: question.content,
              author: question.author,
              hints: question.hints,
              id: question._id,
              level: question.level,
              solution: question.solution,
              title: question.title,
              tests: question.tests,
              solutionTemplate: question.solutionTemplate,
              votes: new Map<string, IVote>(
                Object.keys(question.votes).map((key) => this.mapVotes(key, question.votes))
              )
            };
          });
        })
      )
      .subscribe((transQuestions) => {
        this.questions = transQuestions;
        this.questionsUpdated.next([...this.questions]);
      });
  }

  public mapVotes(voteKey, votes): [string, IVote] {
    return [
      voteKey,
      {
        id: votes[voteKey]._id,
        isUp: votes[voteKey].isUp,
        message: votes[voteKey].message,
        username: votes[voteKey].username
      }
    ];
  }

  public getQuestionsUpdatedListener() {
    return this.questionsUpdated.asObservable();
  }

  public getQuestion(id: string) {
    this.http
      .get<{
        _id: string;
        title: string;
        content: string;
        solutionTemplate: string[];
        solution: string[];
        exampleTests: string[];
        submitionTests: string[];
        hints: string;
        level: number;
        author: string;
        votes: Map<string, IVote>;
      }>(BACKEND_URL + '/' + id)
      .pipe(
        map((question) => {
          return {
            content: question.content,
            author: question.author,
            exampleTests: question.exampleTests,
            hints: question.hints,
            id: question._id,
            level: question.level,
            solution: question.solution,
            solutionTemplate: question.solutionTemplate,
            submitionTests: question.submitionTests,
            title: question.title,
            votes: new Map<string, IVote>(Object.keys(question.votes).map((key) => this.mapVotes(key, question.votes)))
          };
        })
      )
      .subscribe((question) => {
        this.question = question;
        this.questionUpdated.next(this.question);
      });
  }

  public createQuestion(
    title: string,
    content: string,
    solutionTemplate: string[],
    solution: string[],
    exampleTests: string[],
    submitionTests: string[],
    hints: string,
    level: number
  ) {
    const question: IQuestion = {
      content,
      author: null,
      exampleTests,
      hints,
      id: null,
      level,
      solution,
      solutionTemplate,
      submitionTests,
      title,
      votes: new Map<string, IVote>()
    };

    this.addQuestion(question);
  }

  public addQuestion(question: IQuestion) {
    this.http.post<{ message: string; questionId: string }>(BACKEND_URL, question).subscribe((responseData) => {
      question.id = responseData.questionId;
      this.questions.push(question);
      this.questionsUpdated.next([...this.questions]);
    });
  }

  public deleteQuestion(id: string) {
    this.http.delete(BACKEND_URL + '/' + id).subscribe(() => {
      const updatedQuestions = this.questions.filter((question) => question.id !== id);
      this.questions = updatedQuestions;
      this.questionsUpdated.next([...this.questions]);
    });
  }

  public updateQuestion(id: string, question: IQuestion) {
    const questionToUpdate: IQuestion = {
      id,
      title: question.title,
      content: question.content,
      solutionTemplate: question.solutionTemplate,
      solution: question.solution,
      exampleTests: question.exampleTests,
      submitionTests: question.submitionTests,
      hints: question.hints,
      level: question.level,
      author: null,
      votes: question.votes
    };

    this.http.put(BACKEND_URL + '/' + id, questionToUpdate).subscribe(() => {
      const oldQuestionIndex = this.questions.findIndex((q) => q.id === id);
      this.questions[oldQuestionIndex] = question;
      this.questionsUpdated.next([...this.questions]);
      this.router.navigate(['/questions/list']);
    });
  }
}
