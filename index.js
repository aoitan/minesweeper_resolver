/* vim:set sw=2 ts=2 sts=2 fdm=indent: */

const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

const width = parseInt(process.argv[2]);
const height = parseInt(process.argv[3]);
const bombs = parseInt(process.argv[4]);

const ANY = -1;
const OUT_OB_BOARD = -2;
const BOMB = 9;
const FLAG = 10;
const CLOSED = 11;
const OPENED = 12;

function pos2idx(x, y) {
   return x + y * (width + 2);
}

function idx2pos(idx) {
  const x = idx % (width + 2);
  const y = Math.floor(idx / (width + 2));
  return [x, y];
}

// ToDo: ルールが密結合しているので分離する
class Board {
  constructor(width, height, bombs) {
    this._width = width;
    this._height = height;
    this._bombs = bombs;

    // 盤面のデータはセンチネルを含めるのでサイズより一路ずつ広くする
    let size = (this._width + 2) * (this._height + 2);
    //console.log(`func: Board(), s: ${size}`);
    this._data = new Array(size);
    //console.log(`func: Board(), w: ${this._width}, h: ${this._height}, b: ${this._data.length}`);
  }

  init() {
    //console.log(`func: Board$init, w: ${this._width}, h: ${this._height}, b: ${this._data.length}`);
    // 全体を0で埋める
    this._data.fill(0);

    // 最上下段をセンチネルで埋める
    for (let i = 0; i < this._width + 2; ++i) {
      this._data[i] = OUT_OB_BOARD;
      this._data[i + (this._width + 2) * (this._height + 1)] = OUT_OB_BOARD;
    }

    // 最左右列をセンチネルで埋める
    for (let i = 0; i < this._height + 2; ++i) {
      this._data[i * (this._width + 2)] = OUT_OB_BOARD;
      this._data[i * (this._width + 2) + (this._width + 1)] = OUT_OB_BOARD;
    }

    // ランダムに爆弾を埋める
    let i = 0;
    while (i < this._bombs) {
      const x = Math.floor(Math.random() * this._width) + 1;
      const y = Math.floor(Math.random() * this._height) + 1;
      const cell = pos2idx(x, y);
      if (this._data[cell] == BOMB) {
        continue; // すでに置いているのでやりなおし
      }
      this._data[cell] = BOMB;
      i++;
    }

    // 爆弾の周りに数字を入れる
    for (let i = 0; i < this._data.length; ++i) {
      if (this._data[i] == OUT_OB_BOARD) continue;
      if (this._data[i] == BOMB) continue;
      const pos = idx2pos(i);

      // 周囲8マスの爆弾を計上
      const boms = this._countAround(BOMB, pos[0], pos[1]);
      this._data[i] = boms;
    }
  }

  /* private */ _countAround(v, x, y) {
    const around = this.getAround(x, y);
    return around.reduce((p, c) => (c == v)? p + 1: p, 0);
  }

  getAtPos(x, y) {
    const pos = pos2idx(x, y);
    return this._data[pos];
  }

  getAtIndex(idx) {
    return this._data[idx];
  }

  getAround(x, y) {
    const around = [];
    for (let i = -1; i < 2; ++i) {
      for (let j = -1; j < 2; ++j) {
        const value = this._data[pos2idx(x + j, y + i)];
        around.push(value);
      }
    }
    return around;
  }

  isOutOfBoard(x, y) {
    return this._data[pos2idx(x, y)] == OUT_OB_BOARD;
  }

  isBomb(x, y) {
    return this._data[pos2idx(x, y)] == BOMB;
  }

  get width() {
    return this._width;
  }

  get height() {
    return this._height;
  }

  get bombs() {
    return this._bombs;
  }

  get data() {
    return this._data;
  }
}

// ToDo: Boardがいろいろ持ちすぎなのでゲームのルールとゲーム状態を表現するクラスに分離する
class GameState {
  constructor(board) {
    this.board = board;
    this.state;
    this.gameEnd = [];
    this.stateChanged = [];
  }

  init() {
    this.board.init();
    this.state = this.board.data.map(c => (c != OUT_OB_BOARD)? CLOSED: OUT_OB_BOARD);
    this.stateChanged.forEach(i => i.stateChanged(this));
  }

  getAround(x, y) {
    const around = [];
    for (let i = -1; i < 2; ++i) {
      for (let j = -1; j < 2; ++j) {
        const value = this.state[pos2idx(x + j, y + i)];
        around.push(value);
      }
    }
    return around;
  }

  addGameEndListener(l) {
    this.gameEnd.push(l);
  }

  addStateChangedListener(l) {
    this.stateChanged.push(l);
  }

  /* private */ _flag(x, y) {
    const pos = pos2idx(x, y);
    this.state[pos] = FLAG;
  }

  /* private */ _open(x, y) {
    const idx = pos2idx(x, y);
    this.state[idx] = OPENED;
  }

  /*
     指定位置を開けて、開けた場所から自動で開くところは開けてしまう
     爆弾を開けるとfalse
   */
  open(x, y) {
    if (this.board.isBomb(x, y)) {
      this.gameEnd.forEach(i => i.notifyGameEnd(this, false));
      return false;
    }

    this._openAround(x, y);

    if (this.countClosed() > 0) {
      this.stateChanged.forEach(i => i.stateChanged(this));
    } else {
      this.gameEnd.forEach(i => i.notifyGameEnd(this, true));
      return false;
    }
    return true;
  }

  /*
     指定位置に旗を立てる
   */
  flag(x, y) {
    if (!this.isClosed(x, y)) return true;
    this._flag(x, y);

    if (this.countClosed() > 0) {
      this.stateChanged.forEach(i => i.stateChanged(this));
    } else {
      this.gameEnd.forEach(i => i.notifyGameEnd(this, true));
      return false;
    }
    return true;
  }

  /* private */ _openAround(x, y) {
    if (this.board.isOutOfBoard(x, y)) return;
    if (!this.isClosed(x, y)) return;

    this._open(x, y);

    let cell = this.board.getAtPos(x, y);
    if (cell == 0) {
      // 周囲8マスを再帰的に開けていく
      for (let i = -1; i < 2; ++i) {
        for (let j = -1; j < 2; ++j) {
          if (i == 0 && j == 0) continue; // 現在位置はスキップ
          this._openAround(x + j, y + i);
        }
      }
    }
  }

  getAtPos(x, y) {
    const pos = pos2idx(x, y);
    return this.getAtIndex(pos);
  }

  getAtIndex(idx) {
    const state = this.state[idx];
    return (state == OPENED)? this.board.getAtIndex(idx): state;
  }

  closedIndexes() {
    return this.state.reduce((p, c, i) => {
      if (CLOSED == c) {
        p.push(i);
      }
      return p;
    }, []);
  }

  openedNIndexes(n) {
    return this.state.reduce((p, c, i) => {
      if (c == OPENED) {
        const pos = idx2pos(i);
        const flags = this.countFlagsAround(...pos);
        if (n == (this.board.getAtIndex(i) - flags)) {
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

        const idx = pos2idx(x + j, y + i);
        if (this.state[idx] == CLOSED) {
          idxs.push(idx);
        }
      }
    }
    return idxs;
  }

  isOutOfBoard(x, y) {
    return this.board.isOutOfBoard(x, y);
  }

  isBomb(x, y) {
    return this.board.isBomb(x, y);
  }

  isOpened(x, y) {
    return this.state[pos2idx(x, y)] == OPENED;
  }

  isClosed(x, y) {
    return this.state[pos2idx(x, y)] == CLOSED;
  }

  isFlag(x, y) {
    return this.state[pos2idx(x, y)] == FLAG;
  }

  countClosed() {
    return this.state.filter(c => c == CLOSED).length;
  }

  countFlags() {
    return this.state.filter(c => c == FLAG).length;
  }

  countOpened() {
    return this.state.filter(c => c == OPENED).length;
  }

  countClosedAround(x, y) {
    const around = this.getAround(x, y);
    return around.reduce((p, c) => (CLOSED == c)? p + 1: p, 0);
  }

  countFlagsAround(x, y) {
    const around = this.getAround(x, y);
    return around.reduce((p, c) => (FLAG == c)? p + 1: p, 0);
  }

  get displayData() {
    return this.state.map((c, i) => this.getAtIndex(i));
  }

  get width() {
    return this.board.width;
  }

  get height() {
    return this.board.height;
  }
}

// ゲームの進行を制御
class GameEngine {
  constructor(gameState, player) {
    this.gameState = gameState;
    this.player = player;
  }

  async start() {
    this.gameState.init();

    // ゲームのメインループ
    let move = await this.player.move();
    while (this.operation(move.op, move.x, move.y)) {
      move = await this.player.move();
    }
  }

  end() {
  }

  operation(op, x, y) {
    if (op == 'o') {
      return this.gameState.open(x, y);
    } else if (op == 'f') {
      return this.gameState.flag(x, y);
    }
    return true;
  }
}

// ソルバーの解析状態
class SolverContext {
  constructor(gameState) {
    this.gameState = gameState;
  }

  solve() {
    throw 'not implement';
  }

  nextContext() {
    throw 'not implement';
  }
}

class FirstContext extends SolverContext {
  solve() {
    const idxs = this.gameState.closedIndexes();
    const move = {op: 'o', x: 1, y: 1};
    console.log(`FirstContext next move ${JSON.stringify(move)}`);
    return move;
  }

  nextContext() {
    return new FixedContext(this.gameState);
  }
}

class RandomContext extends SolverContext {
  solve() {
    const idxs = this.gameState.closedIndexes();
    const r = Math.floor(Math.random()) * idxs.length;
    const idx = idxs[r];
    const pos = idx2pos(idx);
    const move = {op: 'o', x: pos[0], y: pos[1]};
    console.log(`RandomContext next move ${JSON.stringify(move)}`);
    return move;
  }

  nextContext() {
    return new FixedContext(this.gameState);
  }
}

class FixedContext extends SolverContext {
  constructor(gameState) {
    super(gameState);
    this._nextContext = this;
  }

  searchFixed(n) {
    const opened = this.gameState.openedNIndexes(n);
    for (let cell of opened) {
      const p = idx2pos(cell);
      const closed = this.gameState.countClosedAround(...p);
      const flags = this.gameState.countFlagsAround(...p);
      const value = this.gameState.getAtPos(...p);
      if (closed > 0) {
        const closedIdx = this.gameState.closedIndexesAround(...p);
        const p2 = idx2pos(closedIdx[0]);
        const move = {};
        move.x = p2[0];
        move.y = p2[1];
        if (closed == (value - flags)) {
          move.op = 'f';
          return move;
        } else if (0 == (value - flags)) {
          move.op = 'o';
          return move;
        }
      }
    }
    return null;
  }

  solve() {
    // 確定開きを探す
    let pos = this.searchFixed(0);
    if (pos == null) {
      // 確定旗立て1～8を探す
      let pos18;
      for (let i = 1; i <= 8; ++i) {
        pos18 = this.searchFixed(i);
        if (pos18 != null) {
          pos = pos18;
          break;
        }
      }
    }

    if (pos == null) {
      this._nextContext = new PatternContext(this.gameState);
    }

    console.log(`FixedContext next move ${JSON.stringify(pos)}`);
    return pos;
  }

  nextContext() {
    return this._nextContext;
  }
}

class PatternContext extends SolverContext {
  constructor(gameState) {
    super(gameState);
    this._nextContext = this;
    this.patterns = [
      [ // 1 1横並び下ふさがり
        {pos: [-1, -1], value: ANY, opened: true , op: 'n'}, {pos: [ 0, -1], value: ANY, opened: true , op: 'n'}, {pos: [ 1, -1], value: ANY, opened: true , op: 'n'},
        {pos: [-1,  0], value: ANY, opened: true , op: 'n'}, {pos: [ 0,  0], value: 1  , opened: true , op: 'n'}, {pos: [ 1,  0], value: 1  , opened: true , op: 'n'},
        {pos: [-1,  1], value: ANY, opened: false, op: 'o'}, {pos: [ 0,  1], value: ANY, opened: false, op: 'n'}, {pos: [ 1,  1], value: ANY, opened: false, op: 'n'},
      ],
      [ // 1 1横並び上ふさがり
        {pos: [-1, -1], value: ANY, opened: false, op: 'o'}, {pos: [ 0, -1], value: ANY, opened: false, op: 'n'}, {pos: [ 1, -1], value: ANY, opened: false, op: 'n'},
        {pos: [-1,  0], value: ANY, opened: true , op: 'n'}, {pos: [ 0,  0], value: 1  , opened: true , op: 'n'}, {pos: [ 1,  0], value: 1  , opened: true , op: 'n'},
        {pos: [-1,  1], value: ANY, opened: true , op: 'n'}, {pos: [ 0,  1], value: ANY, opened: true , op: 'n'}, {pos: [ 1,  1], value: ANY, opened: true , op: 'n'},
      ],
      [ // 1 1縦並び左ふさがり
        {pos: [-1, -1], value: ANY, opened: false, op: 'o'}, {pos: [ 0, -1], value: ANY, opened: true , op: 'n'}, {pos: [ 1, -1], value: ANY, opened: true , op: 'n'},
        {pos: [-1,  0], value: ANY, opened: false, op: 'n'}, {pos: [ 0,  0], value: 1  , opened: true , op: 'n'}, {pos: [ 1,  0], value: ANY, opened: true , op: 'n'},
        {pos: [-1,  1], value: ANY, opened: false, op: 'n'}, {pos: [ 0,  1], value: 1  , opened: true , op: 'n'}, {pos: [ 1,  1], value: ANY, opened: true , op: 'n'},
      ],
      [ // 1 1縦並び右ふさがり
        {pos: [-1, -1], value: ANY, opened: true , op: 'n'}, {pos: [ 0, -1], value: ANY, opened: true , op: 'n'}, {pos: [ 1, -1], value: ANY, opened: false, op: 'o'},
        {pos: [-1,  0], value: ANY, opened: true , op: 'n'}, {pos: [ 0,  0], value: 1  , opened: true , op: 'n'}, {pos: [ 1,  0], value: ANY, opened: false, op: 'n'},
        {pos: [-1,  1], value: ANY, opened: true , op: 'n'}, {pos: [ 0,  1], value: 1  , opened: true , op: 'n'}, {pos: [ 1,  1], value: ANY, opened: false, op: 'n'},
      ],
      [ // 1 2 1横並び下ふさがり
        {pos: [-1, -1], value: ANY, opened: true , op: 'n'}, {pos: [ 0, -1], value: ANY, opened: true , op: 'n'}, {pos: [ 1, -1], value: ANY, opened: true , op: 'n'},
        {pos: [-1,  0], value: 1  , opened: true , op: 'n'}, {pos: [ 0,  0], value: 2  , opened: true , op: 'n'}, {pos: [ 1,  0], value: 1  , opened: true , op: 'n'},
        {pos: [-1,  1], value: ANY, opened: false, op: 'f'}, {pos: [ 0,  1], value: ANY, opened: false, op: 'o'}, {pos: [ 1,  1], value: ANY, opened: false, op: 'f'},
      ],
      [ // 1 2 1横並び上ふさがり
        {pos: [-1, -1], value: ANY, opened: false, op: 'f'}, {pos: [ 0, -1], value: ANY, opened: false, op: 'o'}, {pos: [ 1, -1], value: ANY, opened: false, op: 'f'},
        {pos: [-1,  0], value: 1  , opened: true , op: 'n'}, {pos: [ 0,  0], value: 2  , opened: true , op: 'n'}, {pos: [ 1,  0], value: 1  , opened: true , op: 'n'},
        {pos: [-1,  1], value: ANY, opened: true , op: 'n'}, {pos: [ 0,  1], value: ANY, opened: true , op: 'n'}, {pos: [ 1,  1], value: ANY, opened: true , op: 'n'},
      ],
      [ // 1 2 1縦並び左ふさがり
        {pos: [-1, -1], value: ANY, opened: false, op: 'f'}, {pos: [ 0, -1], value: 1  , opened: true , op: 'n'}, {pos: [ 1, -1], value: ANY, opened: true , op: 'n'},
        {pos: [-1,  0], value: ANY, opened: false, op: 'o'}, {pos: [ 0,  0], value: 2  , opened: true , op: 'n'}, {pos: [ 1,  0], value: ANY, opened: true , op: 'n'},
        {pos: [-1,  1], value: ANY, opened: false, op: 'f'}, {pos: [ 0,  1], value: 1  , opened: true , op: 'n'}, {pos: [ 1,  1], value: ANY, opened: true , op: 'n'},
      ],
      [ // 1 2 1縦並び右ふさがり
        {pos: [-1, -1], value: ANY, opened: true , op: 'f'}, {pos: [ 0, -1], value: 1  , opened: true , op: 'n'}, {pos: [ 1, -1], value: ANY, opened: false, op: 'f'},
        {pos: [-1,  0], value: ANY, opened: true , op: 'o'}, {pos: [ 0,  0], value: 2  , opened: true , op: 'n'}, {pos: [ 1,  0], value: ANY, opened: false, op: 'o'},
        {pos: [-1,  1], value: ANY, opened: true , op: 'f'}, {pos: [ 0,  1], value: 1  , opened: true , op: 'n'}, {pos: [ 1,  1], value: ANY, opened: false, op: 'f'},
      ],
    ];
  }

  solve() {
    let move = null;
    if (move == null) {
      this._nextContext = new RandomContext(this.gameState);
    }
    return null;
  }

  nextContext() {
    return this._nextContext;
  }
}

class Solver {
  constructor(gameState) {
    this.context = new FirstContext(gameState);
  }

  solve() {
    let pos = this.context.solve();
    this.context = this.context.nextContext();

    while (pos == null) {
      pos = this.context.solve();
      this.context = this.context.nextContext();
    }

    return pos;
  }
}

// ToDo: 標準入出力に密結合しているので分離する
class Player {
  constructor(viewModel) {
    this.viewModel = viewModel;
  }

  async move() {
    throw `this method is not implemented`;
  }
}

// 人間
class HumanPlayer extends Player {
  async move() {
    const input = await this.viewModel.input('次の手を入力してください (op x y): ');
    const pos = input.trim().split(' ');
    const op = pos[0];
    const x = parseInt(pos[1]);
    const y = parseInt(pos[2]);

    return {op:op, x: x, y: y};
  }
}

// 自分の解いている手順をコーディングする
class SolverPlayer extends Player {
  constructor(gameState, vm) {
    super(vm);
    this.solver = new Solver(gameState);
  }

  async move() {
    const input = await this.viewModel.input('pause');
    const pos = this.solver.solve();
    return pos;
  }
}

// 機械学習で解く
class MLPlayer extends Player {
}

// 表示をモデルから分離する
class BoardView {
  draw() {
    throw 'not implemented';
  }

  answer() {
    throw 'not implemented';
  }

  notifyGameEnd(gameState, isWin) {
    throw 'not implemented';
  }
}

// コマンドラインにテキストで表示する
class BoardCuiView extends BoardView {
  /* private */ _drawImpl(gameState, conv) {
    //console.log(`func: BoardCuiView$_drawImpl, w: ${gameState.w}, h: ${gameState.h}, b: ${gameState.data.length}`);
    let line = [];
    const displayData = gameState.displayData;
    for (let i = 0; i < displayData.length; ++i) {
      if (i % (gameState.width + 2) == 0) {
        console.log(line.join(''));
        line = [];
      }
      line.push(conv(displayData[i]));
    }
    console.log(line.join(''));
    console.log(`closed: ${gameState.countClosed()}, flags: ${gameState.countFlags()}`);
  }

  draw(gameState) {
    const conv = (d) => {
      switch (d) {
        case OUT_OB_BOARD:
          return '#';
        case FLAG:
          return 'F';
        case CLOSED:
          return ' ';
        default:
          return d;
      }
    };
    this._drawImpl(gameState, conv);
  }

  answer(gameState, isWin) {
    const conv = (d) => {
      switch (d) {
        case OUT_OB_BOARD:
          return '#';
        case FLAG:
          return 'F';
        case CLOSED:
          return ' ';
        case BOMB:
          return '*';
        default:
          return d;
      }
    };
    this._drawImpl(gameState, conv);
    if (isWin) {
      console.log(`おめでとう :-)`);
    } else {
      console.log(`アウチ！ X-(`);
    }
  }

  stateChanged(gameState) {
    this.draw(gameState);
  }


  notifyGameEnd(gameState, isWin) {
    this.answer(gameState, isWin);
  }
}

// HTMLにGUIで表示する
class BoardGuiView extends BoardView {
}

// 入出力をモデルから分離する
class BoardViewModel {
  async input(promptMessage) {
    throw 'not implement';
  }
}

class BoardCuiViewModel extends BoardViewModel {
  async input(promptMessage) {
    const p = new Promise((resolve, reject) => {
      readline.question(promptMessage, (input) => {
        resolve(input);
      });
    });

    return p;
  }
}

class BoardGuiViewModel extends BoardViewModel {
}


async function main() {
  const board = new Board(width, height, bombs);

  const gameState = new GameState(board);

  const boardView = new BoardCuiView();
  gameState.addGameEndListener(boardView);
  gameState.addStateChangedListener(boardView);

  const viewModel = new BoardCuiViewModel();

  //const player = new HumanPlayer(viewModel);
  const player = new SolverPlayer(gameState, viewModel);

  const engine = new GameEngine(gameState, player);

  await engine.start();
  engine.end();

  process.exit();
}

main();

