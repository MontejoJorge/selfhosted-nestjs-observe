export class TopPostDto {
  id: number;
  title: string;
  likes: number;
  views: number;
}

export class PostsSummaryDto {
  total: number;
  top: TopPostDto[];
}

export class TodosSummaryDto {
  total: number;
  completed: number;
  /** Completed / total, or `null` when the user has no todos. */
  completionRate: number | null;
}

export class CartsSummaryDto {
  total: number;
  items: number;
  spent: number;
  saved: number;
}

export class UserSummaryDto {
  id: number;
  name: string;
  email: string;
  company: string | null;
  posts: PostsSummaryDto;
  todos: TodosSummaryDto;
  carts: CartsSummaryDto;
}
