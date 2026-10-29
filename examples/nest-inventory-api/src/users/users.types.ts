/** Shapes returned by DummyJSON (https://dummyjson.com). */

export interface DummyUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  company?: { name: string };
}

export interface DummyPost {
  id: number;
  title: string;
  reactions: { likes: number; dislikes: number };
  views: number;
}

export interface DummyTodo {
  id: number;
  completed: boolean;
}

export interface DummyCart {
  id: number;
  total: number;
  discountedTotal: number;
  totalQuantity: number;
}
