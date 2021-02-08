/* vim:set sw=2 ts=2 sts=2 fdm=indent: */

const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

const width = parseInt(process.argv[2]);
const height = parseInt(process.argv[3]);
const bombs = parseInt(process.argv[4]);

const OUT_OB_BOARD = -2;
const BOMB = 19;
const FLAG = 100;
const CLOSED = 10;

class Board {
  constructor(width, height, bombs) {
    this.w = width;
    this.h = height;
    this.b = bombs;

    // 盤面のデータはセンチネルを含めるのでサイズより一路ずつ広くする
    let size = (this.w + 2) * (this.h + 2);
    //console.log(`func: Board(), s: ${size}`);
    this.d = new Array(size);
    //console.log(`func: Board(), w: ${this.w}, h: ${this.h}, b: ${this.d.length}`);
  }

  /* private */ _pos2idx(x, y) {
     return x + y * (this.w + 2);
  }

  /* private */ _idx2pos(idx) {
    const x = idx % (this.w + 2);
    const y = Math.floor(idx / (this.w + 2));
    return [x, y];
  }

  init() {
    //console.log(`func: Board$init, w: ${this.w}, h: ${this.h}, b: ${this.d.length}`);
    // 全体をCLOSEDで埋める
    this.d.fill(CLOSED);

    // 最上下段をセンチネルで埋める
    for (let i = 0; i < this.w + 2; ++i) {
      this.d[i] = OUT_OB_BOARD;
      this.d[i + (this.w + 2) * (this.h + 1)] = OUT_OB_BOARD;
    }

    // 最左右列をセンチネルで埋める
    for (let i = 0; i < this.h + 2; ++i) {
      this.d[i * (this.w + 2)] = OUT_OB_BOARD;
      this.d[i * (this.w + 2) + (this.w + 1)] = OUT_OB_BOARD;
    }

    // ランダムに爆弾を埋める
    let i = 0;
    while (i < this.b) {
      const x = Math.floor(Math.random() * this.w) + 1;
      const y = Math.floor(Math.random() * this.h) + 1;
      const cell = this._pos2idx(x, y);
      if (this.d[cell] == BOMB) {
        continue; // すでに置いているのでやりなおし
      }
      this.d[cell] = BOMB;
      i++;
    }

    // 爆弾の周りに数字を入れる
    for (let i = 0; i < this.d.length; ++i) {
      if (this.d[i] == OUT_OB_BOARD) continue;
      if (this.d[i] == BOMB) continue;
      const pos = this._idx2pos(i);

      // 周囲8マスの爆弾を計上
      const boms = this._countAroundBoms(pos[0], pos[1]);
      this.d[i] = boms + CLOSED;
    }
  }

  /* private */ _countAroundBoms(x, y) {
    const around = this.getAround(x, y);
    return around.reduce((p, c) => (c == BOMB)? p + 1: p, 0);
  }

  /* private */ _drawImpl(conv) {
    //console.log(`func: Board$_drawImpl, w: ${this.w}, h: ${this.h}, b: ${this.d.length}`);
    let line = [];
    for (let i = 0; i < this.d.length; ++i) {
      if (i % (this.w + 2) == 0) {
        console.log(line.join(''));
        line = [];
      }
      line.push(conv(this.d[i]));
    }
    console.log(line.join(''));
    console.log(`closed: ${this.countClosed()}, flags: ${this.countFlags()}`);
  }

  draw() {
    const conv = (d) => {
      if (d >= FLAG) return 'F';
      if (d >= CLOSED) return ' ';

      switch (d) {
        case OUT_OB_BOARD:
          return '#';
        default:
          return d;
      }
    };
    this._drawImpl(conv);
  }

  answer() {
    const conv = (d) => {
      if (d == BOMB) return '*';
      if (d >= FLAG) return 'F';
      if (d >= CLOSED) return d - CLOSED;

      switch (d) {
        case OUT_OB_BOARD:
          return '#';
        default:
          return d;
      }
    };
    this._drawImpl(conv);
  }

  set(v, x, y) {
    const pos = this._pos2idx(x, y);
    this.d[pos] = v;
  }

  get(x, y) {
    const pos = this._pos2idx(x, y);
    return this.d[pos];
  }

  getAround(x, y) {
    const around = [];
    for (let i = -1; i < 2; ++i) {
      for (let j = -1; j < 2; ++j) {
        const value = this.get(x + j, y + i);
        around.push(value);
      }
    }
    return around;
  }

  closedIndexes() {
    return this.d.reduce((p, c, i) => {
      if (CLOSED <= c && c < FLAG) {
        p.push(i);
      }
      return p;
    }, []);
  }

  opened1Indexes() {
    return this.d.reduce((p, c, i) => {
      if (0 <= c && c < CLOSED) {
        const pos = this._idx2pos(i);
        const flags = this.countFlagsAround(...pos);
        if (1 == (c - flags)) {
          p.push(i);
        }
      }
      return p;
    }, []);
  }

  closedIndexesAround(x, y) {
    const idxs = [];
    for (let i = -1; i < 2; ++i) {
      for (let j = -1; j < 2; ++j) {
        if (i == 0 && j == 0) continue;

        const v = this.get(x + j, y + i);
        if (CLOSED <= v && v < FLAG) {
          idxs.push(this._pos2idx(x + j, y + i));
        }
      }
    }
    return idxs;
  }

  isBomb(x, y) {
    return this.get(x, y) == BOMB;
  }

  isOutOfBoard(x, y) {
    return this.get(x, y) == OUT_OB_BOARD;
  }

  isOpened(x, y) {
    const v = this.get(x, y);
    return 0 <= v && v < CLOSED;
  }

  isFlag(x, y) {
    return FLAG <= this.get(x, y);
  }

  isAllOpened() {
    const closed = this.countUnopened();
    return closed == this.b;
  }

  isOpenedAround(x, y) {
    if (!this.isOpened(x, y)) return false;
    const expected = 8 - this.get(x, y);
    const around = this.getAround(x, y);
    const closed = around.reduce((p, c) => (CLOSED <= c && c < FLAG)? p + 1: p, 0);
    return closed == expected;
  }

  countUnopened() {
    return this.d.reduce((p, c) => (CLOSED <= c)? p + 1: p, 0);
  }

  countClosed() {
    return this.countUnopened() - this.countFlags();
  }

  countFlags() {
    return this.d.reduce((p, c) => (FLAG <= c)? p + 1: p, 0);
  }

  countOpened() {
    const closed = this.countUnopened();
    return this.w * this.h - closed;
  }

  countClosedAround(x, y) {
    const around = this.getAround(x, y);
    return around.reduce((p, c) => (CLOSED <= c && c < FLAG)? p + 1: p, 0);
  }

  countFlagsAround(x, y) {
    const around = this.getAround(x, y);
    return around.reduce((p, c) => (FLAG <= c)? p + 1: p, 0);
  }

  get width() {
    return this.w;
  }

  get height() {
    return this.h;
  }

  get bombs() {
    return this.b;
  }
}

class GameEngine {
  constructor(board, player) {
    this.b = board;
    this.p = player;
  }

  async start() {
    this.b.init();
    this.b.draw();

    // ゲームのメインループ
    let move = await this.p.move();
    while (this.operation(move.op, move.x, move.y)) {
      this.b.draw();
      if (this.b.isAllOpened()) break;
      move = await this.p.move();
    }
  }

  end() {
    this.b.answer();
  }

  operation(op, x, y) {
    if (op == 'o') {
      return this.open(x, y);
    } else if (op == 'f') {
      return this.flag(x, y);
    } else if (op == 'a') {
      this.b.answer();
    }
    return true;
  }

  /*
     指定位置を開けて、開けた場所から自動で開くところは開けてしまう
     爆弾を開けるとfalse
   */
  open(x, y) {
    if (this.b.isBomb(x, y)) return false;

    this._openAround(x, y);

    return true;
  }

  /*
     指定位置に旗を立てる
   */
  flag(x, y) {
    let v = this.b.get(x, y);
    if (v < CLOSED) return true;
    if (v >= FLAG) {
      v -= FLAG;
    } else {
      v += FLAG;
    }
    this.b.set(v, x, y);
    return true;
  }

  /* private */ _openAround(x, y) {
    let cell = this.b.get(x, y);
    if (cell < 0) return; // 何らかの特殊マス
    if (cell < CLOSED) return; // すでに開いている

    cell -= CLOSED;
    this.b.set(cell, x, y);

    if (cell == 0) {
      // 周囲8マスを再帰的に開けていく
      for (let i = -1; i < 2; ++i) {
        for (let j = -1; j < 2; ++j) {
          if (i == 0 && j == 0) continue;
          this._openAround(x + j, y + i);
        }
      }
    }
  }
}

class Player {
  async move() {
    throw `this method is not implemented`;
  }
}

// 人間
class HumanPlayer extends Player {
  async move() {
    const p = new Promise((resolve, reject) => {
      readline.question(`次の場所を入力してください(op x y): `, (input) => {
        const pos = input.split(' ');
        const op = pos[0];
        const x = parseInt(pos[1]);
        const y = parseInt(pos[2]);
        resolve({op:op, x: x, y: y});
      });
    });

    return p;
  }
}

// 自分の解いている手順をコーディングする
class SolverPlayer extends Player {
  constructor(board) {
    super();
    this.b = board;
  }

  async move() {
    const p = new Promise((resolve, reject) => {
      const b = this.b;
      readline.question(`pause`, (input) => {
        const pos = {};

        // 初手左上
        if (b.countOpened() == 0) {
          pos.op = 'o';
          pos.x = 1;
          pos.y = 1;
        } else {
          // 角1を探す
          // ??1
          //  *?
          //   ?
          const opened1 = b.opened1Indexes();
          for (let cell of opened1) {
            const closed = b.countClosedAround(...b._idx2pos(cell));
            if (closed == 1) {
              const closedIdx = b.closedIndexesAround(...b._idx2pos(cell));
              const p = b._idx2pos(closedIdx[0]);
              pos.op = 'f';
              pos.x = p[0];
              pos.y = p[1];
              resolve(pos);
              return;
            }
          }

          // 1-1を探す
          //   11
          // ? ?? ?

          // 1-2-1を探す
          // 121
          // * *

          // 1-2-2-1を探す
          // 1221
          //  ** 

          // 確定3を探す
          //  3
          // ***

          // 確定2を探す
          // ###
          // #22
          // #**

          // 確定がないので適当に開ける
          const closedIdxs = b.closedIndexes();
          const idx = Math.floor(Math.random() * closedIdxs.length);
          const p = b._idx2pos(closedIdxs[idx]);

          pos.op = 'o';
          pos.x = p[0];
          pos.y = p[1];
        }
        resolve(pos);
      });
    });
    return p;
  }
}

// 機械学習で解く
class MLPlayer extends Player {
}


async function main() {
  const board = new Board(width, height, bombs);

  //const player = new HumanPlayer();
  const player = new SolverPlayer(board);

  const engine = new GameEngine(board, player);

  await engine.start();
  engine.end();

  process.exit();
}

main();

