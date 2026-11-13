import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../integrations/database/database.module';
import { AnswerService } from '../answers/answer.service';

@Injectable()
export class ConversationsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly answers: AnswerService,
  ) {}

  create(documentId?: string) {
    return this.db.conversation.create({ data: { documentId } });
  }

  async read(id: string, after: number) {
    const conversation = await this.db.conversation.findUnique({
      where: { id },
      include: {
        turns: {
          where: { sequence: { gt: after } },
          orderBy: { sequence: 'asc' },
          take: 50,
        },
      },
    });
    if (!conversation) throw new NotFoundException('Conversation not found.');
    return conversation;
  }

  async append(id: string, question: string, version: number) {
    const conversation = await this.db.conversation.findUnique({
      where: { id },
      include: {
        turns: {
          orderBy: { sequence: 'desc' },
          take: 3,
          select: { question: true, answer: true },
        },
      },
    });
    if (!conversation) throw new NotFoundException('Conversation not found.');
    if (conversation.version !== version)
      throw new ConflictException(
        'Conversation changed. Read the latest turns before continuing.',
      );
    const history = conversation.turns.reverse().map(function bounded(turn) {
      return {
        question: turn.question.slice(0, 500),
        answer: turn.answer.slice(0, 500),
      };
    });
    const result = await this.answers.answer(
      {
        query: question.trim(),
        topK: 5,
        documentId: conversation.documentId ?? undefined,
      },
      history,
    );
    return this.db.$transaction(async function save(tx) {
      const changed = await tx.conversation.updateMany({
        where: { id, version },
        data: { version: { increment: 1 } },
      });
      if (!changed.count)
        throw new ConflictException(
          'Conversation changed. Read the latest turns before continuing.',
        );
      return tx.conversationTurn.create({
        data: {
          conversationId: id,
          sequence: version + 1,
          question: question.trim(),
          answer: result.answer,
          status: result.status,
          citations: result.citations.map(function snapshot(citation) {
            return { ...citation };
          }),
        },
      });
    });
  }
}
