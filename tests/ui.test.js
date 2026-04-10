import { describe, it, expect, beforeEach } from 'vitest';
import { createModal, currencyInputHTML, parseCurrency } from '../js/ui.js';

describe('parseCurrency', () => {
  it('retorna null para string vazia/null', () => {
    expect(parseCurrency('')).toBe(null);
    expect(parseCurrency(null)).toBe(null);
    expect(parseCurrency(undefined)).toBe(null);
  });

  it('parseia valores simples', () => {
    expect(parseCurrency('100')).toBe(100);
    expect(parseCurrency('99,50')).toBe(99.5);
  });

  it('parseia valores com separador de milhar', () => {
    expect(parseCurrency('1.234,56')).toBe(1234.56);
    expect(parseCurrency('1.000.000,00')).toBe(1000000);
  });

  it('retorna null para string inválida', () => {
    expect(parseCurrency('abc')).toBe(null);
  });

  it('lida com só vírgula decimal', () => {
    expect(parseCurrency('0,99')).toBe(0.99);
  });
});

describe('currencyInputHTML', () => {
  it('gera HTML com id e placeholder default', () => {
    const html = currencyInputHTML('myInput');
    expect(html).toContain('id="myInput"');
    expect(html).toContain('placeholder="0,00"');
    expect(html).toContain('R$');
    expect(html).toContain('inputmode="decimal"');
  });

  it('aceita placeholder customizado', () => {
    const html = currencyInputHTML('myInput', '100,00');
    expect(html).toContain('placeholder="100,00"');
  });
});

describe('createModal', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('cria overlay com id e conteúdo', () => {
    const overlay = createModal('testModal', '<p>Hello</p>');
    expect(overlay.id).toBe('testModal');
    expect(overlay.className).toBe('modal-overlay');
    expect(overlay.innerHTML).toContain('<p>Hello</p>');
    expect(document.getElementById('testModal')).toBe(overlay);
  });

  it('remove modal anterior com mesmo id antes de criar', () => {
    createModal('dupModal', '<p>1</p>');
    createModal('dupModal', '<p>2</p>');
    const all = document.querySelectorAll('#dupModal');
    expect(all).toHaveLength(1);
    expect(all[0].innerHTML).toContain('<p>2</p>');
  });

  it('aplica max-width customizado', () => {
    const overlay = createModal('widthModal', '<p>x</p>', { maxWidth: '500px' });
    const box = overlay.querySelector('.modal-box');
    expect(box.style.maxWidth).toBe('500px');
  });

  it('fecha ao clicar no overlay (fora do box)', () => {
    const overlay = createModal('closeModal', '<p>x</p>');
    expect(document.getElementById('closeModal')).not.toBeNull();
    overlay.click(); // target === overlay
    expect(document.getElementById('closeModal')).toBeNull();
  });

  it('chama onClose callback ao fechar', () => {
    let called = false;
    const overlay = createModal('cbModal', '<p>x</p>', {
      onClose: () => {
        called = true;
      }
    });
    overlay.click();
    expect(called).toBe(true);
  });

  it('fecha ao clicar no botão X', () => {
    const overlay = createModal('xModal', '<p>x</p>');
    const closeBtn = overlay.querySelector('[data-modal-close]');
    expect(closeBtn).not.toBeNull();
    closeBtn.click();
    expect(document.getElementById('xModal')).toBeNull();
  });
});
