import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Inject, Injectable, Optional, PLATFORM_ID, SecurityContext } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { parse } from 'marked';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import * as katex from 'katex';

import { MarkedOptions } from './marked-options';
import { MarkedRenderer } from './marked-renderer';

declare var Prism: {
  highlightAllUnder: (element: Element | Document) => void;
};

// tslint:disable-next-line:max-line-length
export const errorSrcWithoutHttpClient = '[ngx-markdown] When using the [src] attribute you *have to* pass the `HttpClient` as a parameter of the `forRoot` method. See README for more information';

@Injectable()
export class MarkdownService {
  private _options: MarkedOptions;

  get options(): MarkedOptions { return this._options; }
  set options(value: MarkedOptions) {
    this._options = Object.assign({},
      { renderer: new MarkedRenderer() },
      this._options,
      value,
    );
  }

  get renderer(): MarkedRenderer { return this.options.renderer; }
  set renderer(value: MarkedRenderer) {
    this.options.renderer = value;
  }

  constructor(
    @Inject(PLATFORM_ID) private platform: Object,
    @Optional() private http: HttpClient,
    private domSanitizer: DomSanitizer,
    options: MarkedOptions,
  ) {
    this.options = options;
  }

  compile(markdown: string, decodeHtml = false, useKatex = false, markedOptions = this.options): string {
    let precompiled = this.precompile(markdown);
    precompiled = useKatex ?
      precompiled.replace(/^\$([^\$]*)\$/gm, (_, latex_expression) => {
        return katex.renderToString(latex_expression, {throwOnError: false});
      }) : precompiled;
    const compiled = parse(
      decodeHtml ? this.decodeHtml(precompiled) : precompiled,
      markedOptions);

    return markedOptions.sanitize && !markedOptions.sanitizer
      ? this.domSanitizer.sanitize(SecurityContext.HTML, compiled)
      : compiled;
  }

  getSource(src: string): Observable<string> {
    if (!this.http) {
      throw new Error(errorSrcWithoutHttpClient);
    }
    return this.http
      .get(src, { responseType: 'text' })
      .pipe(map(markdown => this.handleExtension(src, markdown)));
  }

  highlight(element?: Element | Document) {
    if (isPlatformBrowser(this.platform) && typeof Prism !== 'undefined') {
      if (!element) {
        element = document;
      }
      const noLanguageElements = element.querySelectorAll('pre code:not([class*="language-"])');
      Array.prototype.forEach.call(noLanguageElements, (x: Element) => x.classList.add('language-none'));
      Prism.highlightAllUnder(element);
    }
  }

  private decodeHtml(html: string) {
    if (isPlatformBrowser(this.platform)) {
      const textarea = document.createElement('textarea');
      textarea.innerHTML = html;
      return textarea.value;
    }
    return html;
  }

  private handleExtension(src: string, markdown: string): string {
    const extension = src
      ? src.split('?')[0].split('.').splice(-1).join()
      : null;
    return extension !== 'md'
      ? '```' + extension + '\n' + markdown + '\n```'
      : markdown;
  }

  private precompile(markdown: string): string {
    if (!markdown) {
      return '';
    }
    let indentStart: number;
    return markdown
      .split('\n')
      .map(line => {
        // set current line ident start to base reference indentation
        let lineIdentStart = indentStart;
        // find position of 1st non-whitespace character
        // to determine the current line indentation start
        if (line.length > 0) {
          lineIdentStart = isNaN(lineIdentStart)
            ? line.search(/\S|$/)
            : Math.min(line.search(/\S|$/), lineIdentStart);
        }
        // keep 1st non-whitespace line indentation
        // as base reference for other lines
        if (isNaN(indentStart)) {
          indentStart = lineIdentStart;
        }
        // remove whitespaces before current line indentation
        return !!lineIdentStart
          ? line.substring(lineIdentStart)
          : line;
      }).join('\n');
  }
}
