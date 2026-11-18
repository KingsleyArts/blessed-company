import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }
  create(): void {
    this.add.text(this.scale.width / 2, this.scale.height / 2, 'Blessed Company', { fontSize: '64px', color: '#f5e6b8' }).setOrigin(0.5);
  }
}
