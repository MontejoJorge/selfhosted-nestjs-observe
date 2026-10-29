import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { getJson, UpstreamNotFoundError } from '../common/http/get-json.js';
import { round2 } from '../common/round.js';
import { UserSummaryDto } from './dto/user-summary.dto.js';
import { DummyCart, DummyPost, DummyTodo, DummyUser } from './users.types.js';

const DUMMYJSON_URL = 'https://dummyjson.com';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  async getSummary(userId: number): Promise<UserSummaryDto> {
    this.logger.log(`Building summary for user ${userId}`);
    const user = await this.fetchUser(userId);

    const [posts, todos, carts] = await Promise.all([
      this.fetchPosts(userId),
      this.fetchTodos(userId),
      this.fetchCarts(userId),
    ]);

    return this.buildSummary(user, posts, todos, carts);
  }

  private async fetchUser(userId: number): Promise<DummyUser> {
    try {
      return await getJson<DummyUser>(`${DUMMYJSON_URL}/users/${userId}`);
    } catch (error) {
      if (error instanceof UpstreamNotFoundError) {
        this.logger.warn(`User ${userId} does not exist upstream`);
        throw new NotFoundException(`User ${userId} not found`);
      }
      throw error;
    }
  }

  private async fetchPosts(userId: number): Promise<DummyPost[]> {
    const { posts } = await getJson<{ posts: DummyPost[] }>(
      `${DUMMYJSON_URL}/posts/user/${userId}`,
    );
    return posts;
  }

  private async fetchTodos(userId: number): Promise<DummyTodo[]> {
    const { todos } = await getJson<{ todos: DummyTodo[] }>(
      `${DUMMYJSON_URL}/todos/user/${userId}`,
    );
    return todos;
  }

  private async fetchCarts(userId: number): Promise<DummyCart[]> {
    const { carts } = await getJson<{ carts: DummyCart[] }>(
      `${DUMMYJSON_URL}/carts/user/${userId}`,
    );
    return carts;
  }

  private buildSummary(
    user: DummyUser,
    posts: DummyPost[],
    todos: DummyTodo[],
    carts: DummyCart[],
  ): UserSummaryDto {
    const completedTodos = todos.filter((todo) => todo.completed).length;
    const topPosts = [...posts]
      .sort((a, b) => b.reactions.likes - a.reactions.likes)
      .slice(0, 3)
      .map(({ id, title, reactions, views }) => ({
        id,
        title,
        likes: reactions.likes,
        views,
      }));
    const spent = carts.reduce((sum, cart) => sum + cart.discountedTotal, 0);
    const saved = carts.reduce(
      (sum, cart) => sum + (cart.total - cart.discountedTotal),
      0,
    );

    this.logger.log(
      `User ${user.id}: ${posts.length} posts, ${todos.length} todos, ${carts.length} carts`,
    );

    return {
      id: user.id,
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      company: user.company?.name ?? null,
      posts: { total: posts.length, top: topPosts },
      todos: {
        total: todos.length,
        completed: completedTodos,
        completionRate: todos.length
          ? round2(completedTodos / todos.length)
          : null,
      },
      carts: {
        total: carts.length,
        items: carts.reduce((sum, cart) => sum + cart.totalQuantity, 0),
        spent: round2(spent),
        saved: round2(saved),
      },
    };
  }
}
