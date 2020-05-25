import {
    Component,
    Input,
    Output,
    EventEmitter,
    OnInit,
    Renderer2,
    OnChanges,
    SimpleChanges,
    AfterViewInit,
    ViewChild,
    ElementRef,
    ViewEncapsulation,
    OnDestroy} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { EditorService, EventType, CodeType } from './editor.service';
import { ThemeService } from './theme/theme.service';
import { EditorState } from './editor-state';


@Component({
    selector: 'app-editor',
    templateUrl: './editor.component.html',
    styleUrls: [ './editor.component.css' ],
    encapsulation: ViewEncapsulation.None
})
export class EditorComponent implements OnInit, OnDestroy, OnChanges, AfterViewInit {

    constructor(
        public sanitizer: DomSanitizer,
        private renderer: Renderer2,
        public editorService: EditorService,
        private themeService: ThemeService) {}

    @Input() public highlightsFor;
    @Input() public fitEditorToContainer = 'false';
    @Input() public editable = 'true';
    @Input() public lineNumbering = 'false';
    @Input() public deletePrevValueOnChange = 'true';
    @Input() public value = '';
    @Input() public theme = 'light';
    @Input() public initialValue = '';
    @Output() public valueChanged = new EventEmitter<string>();
    @Output() public editorKeyDown = new EventEmitter<KeyboardEvent>();
    @Output() public editorKeyUp = new EventEmitter<KeyboardEvent>();
    @Output() public editorInput = new EventEmitter<KeyboardEvent>();
    @Output() public editorMouseDown = new EventEmitter<MouseEvent>();
    @Output() public editorMouseUp = new EventEmitter<MouseEvent>();

    @ViewChild('editor', {read: ElementRef}) editor: ElementRef;

    private tabsInsideCurrentLine = 0;
    private currentLine = -1;
    private anchorIndex: number;
    private focusIndex: number;
    private previousText: string;
    private history: EditorState[] = [];
    private future: EditorState[] = [];
    private eventsToSkipSaveState: ((event: Event) => boolean)[] = [];
    public linesNumbers: number[] = [1];

    ngOnDestroy(): void {
        this.themeService.reset();
    }

    ngOnInit(): void {
        this.themeService.setActiveThemeByName(this.theme);
    }

    ngAfterViewInit(): void {
        this.renderText(this.initialValue, this.deletePrevValueOnChange === 'true' || this.shouldHightlight());
        this.eventsToSkipSaveState.push((event) => this.getEditorText() === this.previousText);
        this.eventsToSkipSaveState.push((event) => (event as KeyboardEvent).ctrlKey);
        this.eventsToSkipSaveState.push((event) => (event as KeyboardEvent).key === 'Backspace');

        this.editorService.addEventHandler(this.editor, EventType.KeyDown, () => this.previousText = this.getEditorText());
        this.editorService.addEventHandler(this.editor, EventType.KeyDown, this.handleDeletion.bind(this));
        this.editorService.addEventHandler(this.editor, EventType.KeyDown, this.putCharOnKeyDown.bind(this));
        this.editorService.addEventHandler(this.editor, EventType.KeyDown, this.initFirstViewLine.bind(this));
        this.editorService.addEventHandler(this.editor, EventType.KeyDown, this.cutSelectedLines.bind(this));
        this.editorService.addEventHandler(this.editor, EventType.KeyDown, this.handleTabs.bind(this));
        this.editorService.addEventHandler(this.editor, EventType.KeyDown, this.refreshTabsCount.bind(this));
        this.editorService.addEventHandler(this.editor, EventType.KeyDown, this.onEnterPressedCreateNewLine.bind(this));
        this.editorService.addEventHandler(this.editor, EventType.KeyDown, this.insertTabsOnNewLine.bind(this));
        this.editorService.addEventHandler(this.editor, EventType.KeyDown, this.saveState.bind(this));
        this.editorService.addEventHandler(this.editor, EventType.KeyDown, this.refreshLocation.bind(this));
        this.editorService.addEventHandler(this.editor, EventType.KeyDown, this.onTextChanged.bind(this));
        this.editorService.addEventHandler(this.editor, EventType.KeyDown, this.refreshLineNumbers.bind(this));
        this.editorService.addEventHandler(this.editor, EventType.KeyDown, this.hightlightLineOnKeyDown.bind(this));
        this.editorService.addEventHandler(this.editor, EventType.KeyUp, this.refreshLocation.bind(this));
        this.editorService.addEventHandler(this.editor, EventType.KeyUp, this.onTextChanged.bind(this));
        this.editorService.addEventHandler(this.editor, EventType.KeyUp, this.refreshLineNumbers.bind(this));
        this.editorService.addEventHandler(this.editor, EventType.KeyUp, () => this.valueChanged.emit(this.getEditorText()));

        if (this.editable === 'false') {
            this.renderer.setAttribute(this.editor.nativeElement, 'contenteditable', this.editable);
            this.renderer.addClass(this.editor.nativeElement, 'uneditable');
        }

        if (this.fitEditorToContainer === 'true') {
            this.renderer.setStyle(this.editor.nativeElement, 'height', '100%');
        }
    }

    // When code is requested from the server it takes time for it to reach the client.
    // Because of this reason we'll listen to changes in 'value' and update the editor accordingly.
    ngOnChanges(changes: SimpleChanges): void {
        if (changes.value) {
            this.renderText(changes.value.currentValue,
                this.deletePrevValueOnChange === 'true' || this.shouldHightlight());
        }
    }

    onInput(event: KeyboardEvent): void {
        this.editorService.handleEvent(this.editor, event);
        this.editorInput.emit(event);
    }

    onKeyUp(event: KeyboardEvent): void {
        this.editorService.handleEvent(this.editor, event);
        this.editorKeyUp.emit(event);
    }

    onKeyDown(event: KeyboardEvent): void {
        this.editorService.handleEvent(this.editor, event);
        this.editorKeyDown.emit(event);
    }

    onMouseUp(event: MouseEvent): void {
        this.editorService.handleEvent(this.editor, event);
        this.editorMouseUp.emit(event);
    }

    onMouseDown(event: MouseEvent): void {
        this.editorService.handleEvent(this.editor, event);
        this.editorMouseDown.emit(event);
    }

    onTextChanged(event: KeyboardEvent): void {
        let text;
        const undo = event.ctrlKey && event.key === 'z';
        const redo = event.ctrlKey && event.key === 'y';

        if (undo) {
            if (event.type === 'keydown' && this.history.length > 0) {
                const prevState = this.history.pop();
                text = prevState.value;
                this.tabsInsideCurrentLine = prevState.tabsInsideCurrentLine;
                this.anchorIndex = prevState.anchorIndex;
                this.focusIndex = prevState.focusIndex;
                this.previousText = prevState.previousText;
                this.currentLine = prevState.currentLine;
            }

            event.preventDefault();
        } else if (redo) {
            // TO-DO
        } else {
            text = this.getEditorText();
        }

        if (text !== this.previousText || event.type === 'keydown' && undo) {
            this.renderText(text, this.deletePrevValueOnChange === 'true' || this.shouldHightlight());
            this.restoreSelection();
        }
    }

    putCharOnKeyDown(event: KeyboardEvent): void {
        const sel: Selection = document.getSelection();
        const input: string = event.key;

        if (!event.ctrlKey
            && (input.length === 1
                && /[a-zA-Z0-9-_@#$%^&*=()!~`:;"',\./?<>}{} ]/.test(input)
                || input === '[' || input === ']')) {
            let range: Range;

            if (!sel.anchorNode) {
                range = new Range();
                const lines: NodeList = this.editor.nativeElement.querySelectorAll('.view-line');

                if (lines.length > 0) {
                    range.setStart(lines[0], 0);
                    range.collapse(true);
                }

                sel.removeAllRanges();
                sel.addRange(range);
            } else {
                range = sel.getRangeAt(0);
            }

            if (!this.autoComplete(event)) {
                const textNode: Text = this.renderer.createText(input);
                range.insertNode(textNode);
                range.setStartAfter(textNode);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
                event.preventDefault();
            }
        }
    }

    renderText(value: string, deleteOnChange: boolean): void {
        if (this.editor && value && value !== '') {
            const editor: HTMLElement = this.editor.nativeElement;
            let viewLineOpened = false;
            let viewLine: HTMLDivElement;

            if (deleteOnChange) {
                editor.innerHTML = '';
            }

            if (value.charAt(value.length - 1) !== '\n') {
                value += '\n';
            }

            Array.from(value).forEach(char => {
                if (!viewLineOpened) {
                    viewLineOpened = true;
                    viewLine = this.editorService.addNewLine(editor);
                    this.renderer.listen(viewLine, 'mousedown', this.hightlightLineOnMouseDown.bind(this));
                }

                const isWhitesapce = /^\s+$/.test(char);
                const shouldHightlight = this.shouldHightlight();
                const isStructuralChar = shouldHightlight && this.editorService.isStructuralChar(char, this.highlightsFor.toLowerCase());
                const appendText = isWhitesapce || isStructuralChar;

                if (appendText) {
                    if (shouldHightlight) {
                        this.editorService.appendText(viewLine, null, this.highlightsFor.toLowerCase());
                    } else {
                        this.editorService.appendText(viewLine);
                    }
                }

                if (isWhitesapce) {
                    if (char === '\n') {
                        viewLineOpened = false;
                    } else if (char === '\t') {
                        this.editorService.appendTab(viewLine);
                    } else if (char === ' ') {
                        this.editorService.addSpace(viewLine);
                    }
                } else {
                    this.editorService.buildString(char);

                    if (isStructuralChar) {
                        this.editorService.appendText(viewLine, null, this.highlightsFor.toLowerCase());
                    }
                }
            });

            this.refreshLineNumbers();
        }
    }

    saveState(event: KeyboardEvent): void {
        let saveState = true;
        this.eventsToSkipSaveState.forEach(check => saveState = saveState && !check(event));

        if (saveState) {
            this.history.push({
                currentLine: this.currentLine,
                value: this.previousText,
                tabsInsideCurrentLine: this.tabsInsideCurrentLine,
                anchorIndex: this.anchorIndex,
                focusIndex: this.focusIndex,
                previousText: this.previousText
            });
        }
    }

    scrollToEnd(): void {
        const line: HTMLElement = this.editorService.getSelectedElementParentLine(this.editor.nativeElement, document.getSelection());
        const lines: NodeList = this.editor.nativeElement.querySelectorAll('.view-line');

        if (line === lines[lines.length - 1]) {
            this.editor.nativeElement.scrollTop = line.offsetTop;
        }
    }

    hightlightLineOnKeyDown(event): void {
        const lines: NodeList = this.editor.nativeElement.querySelectorAll('.view-line');

        if (event.ctrlKey) {
            switch (event.key) {
                case 'Home':
                    this.hightlightLine(lines[0] as HTMLDivElement);
                    break;
                case 'End':
                    this.hightlightLine(lines[lines.length - 1] as HTMLDivElement);
                    break;
            }
        }

        switch (event.key) {
            case 'ArrowDown':
                if (this.currentLine + 1 < lines.length) {
                    this.hightlightLine(lines[this.currentLine + 1] as HTMLDivElement);
                }
                break;
            case 'ArrowUp':
                if (this.currentLine - 1 >= 0) {
                    this.hightlightLine(lines[this.currentLine - 1] as HTMLDivElement);
                }
                break;
            case 'ArrowRight':
                if (this.currentLine < lines.length - 1
                    && this.focusIndex === lines[this.currentLine].textContent.length) {
                    this.hightlightLine(lines[this.currentLine + 1] as HTMLDivElement);
                }
                break;
            case 'ArrowLeft':
                if (this.currentLine > 0 && this.focusIndex === 0) {
                    this.hightlightLine(lines[this.currentLine - 1] as HTMLDivElement);
                }
                break;
        }
    }

    getCaretPosition() {
        let caretPos = 0;
        const sel = window.getSelection();

        if (sel.rangeCount) {
            const range = sel.getRangeAt(0);
            caretPos = range.endOffset;
        }

        return caretPos;
    }

    hightlightLineOnMouseDown(event): void {
        if (this.editable === 'true') {
            this.refreshLocation(event);
            const anchorLine = event.target;
            this.hightlightLine(anchorLine);
        }
    }

    hightlightLine(line: HTMLDivElement) {
        const lines = this.editor.nativeElement.querySelectorAll('.view-line');

        if (line) {
            let currentLineSet = false;
            this.currentLine = 0;

            lines.forEach(currLine => {
                if (currLine === line) {
                    currentLineSet = true;
                    this.renderer.addClass(currLine, 'line-focus');
                } else {
                    this.renderer.removeClass(currLine, 'line-focus');
                }

                if (!currentLineSet) {
                    this.currentLine++;
                }
            });
        }
    }

    getParentLine(node: HTMLElement): HTMLElement {
        let anchorLine: HTMLElement = node;

        while ((!anchorLine.classList || !anchorLine.classList.contains('view-line'))
        && !anchorLine.isSameNode(this.editor.nativeElement)) {
            anchorLine = anchorLine.parentElement;
        }

        if (node.isSameNode(this.editor.nativeElement)) {
            anchorLine = null;
        }

        return anchorLine;
    }

    selectLines(anchorLine: HTMLDivElement, focusLine: HTMLDivElement): Range {
        const range: Range = new Range();
        range.setStartBefore(anchorLine);
        range.setEndAfter(focusLine);

        return range;
    }

    cutSelectedLines(event): void {
        if (event.ctrlKey && event.key === 'x') {
            const lines: NodeList = this.editor.nativeElement.querySelectorAll('.view-line');
            let isSingleLineAndEmpty: boolean = lines.length === 1 && lines[0].textContent === '';

            if (!isSingleLineAndEmpty) {
                const sel: Selection = document.getSelection();
                const anchorLine: HTMLElement = this.getParentLine(sel.anchorNode as HTMLElement);
                const focusLine: HTMLElement = this.getParentLine(sel.focusNode as HTMLElement);

                if (anchorLine && focusLine) {
                    this.history.push({
                        currentLine: this.currentLine,
                        value: this.previousText,
                        tabsInsideCurrentLine: this.tabsInsideCurrentLine,
                        anchorIndex: this.anchorIndex,
                        focusIndex: this.focusIndex,
                        previousText: this.previousText
                    });

                    const range = this.selectLines(anchorLine as HTMLDivElement, focusLine as HTMLDivElement);
                    sel.removeAllRanges();
                    sel.addRange(range);
                    document.execCommand('cut');
                    isSingleLineAndEmpty = lines.length === 1 && lines[0].textContent === '';

                    if (focusLine === lines[lines.length - 1] && !isSingleLineAndEmpty) {
                        focusLine.parentElement.removeChild(focusLine);
                    }
                }
            }

            event.preventDefault();
        }
    }

    getSiblingToMoveToAfterCut(anchorNode, focusNode): HTMLElement {
        let sibling: HTMLElement;

        if (focusNode.nextSibling) {
            sibling = focusNode.nextSibling;

            this.history.push({
                currentLine: this.currentLine,
                value: this.previousText,
                tabsInsideCurrentLine: this.tabsInsideCurrentLine,
                anchorIndex: this.anchorIndex,
                focusIndex: this.focusIndex,
                previousText: this.previousText
            });
        } else {
            sibling = anchorNode.previousSibling;

            this.history.push({
                currentLine: this.currentLine,
                value: this.previousText,
                tabsInsideCurrentLine: this.tabsInsideCurrentLine,
                anchorIndex: 0,
                focusIndex: 0,
                previousText: this.previousText
            });
        }

        return sibling;
    }

    autoComplete(event: KeyboardEvent): boolean {
        let opening: Text;
        let closure: Text;
        let autoCompleted = false;

        if (event.key === '{') {
            opening = this.renderer.createText('{');
            closure = this.renderer.createText('}');
        } else if (event.key === '[') {
            opening = this.renderer.createText('[');
            closure = this.renderer.createText(']');
        } else if (event.key === '(') {
            opening = this.renderer.createText('(');
            closure = this.renderer.createText(')');
        }

        if (opening) {
            const sel = document.getSelection();
            const range = sel.getRangeAt(0);

            range.insertNode(closure);
            range.insertNode(opening);
            range.collapse(true);
            range.setStartBefore(closure);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            event.preventDefault();
            autoCompleted = true;
        }

        return autoCompleted;
    }

    getEditorText(): string {
        const lines: string[] = [];

        this.getTextSegments(this.editor.nativeElement, true).forEach(line => {
            lines.push(line.text);
            lines.push('\n');
        });

        return lines.join('');
    }

    refreshCurrentLine(lineElement: Node): void {
        const lines: NodeList = this.editor.nativeElement.querySelectorAll('.view-line');
        const linesCount = lines.length;

        for (let i = 0; i < linesCount; i++) {
            this.currentLine = i;

            if (lines[i] === lineElement) {
                break;
            }
        }
    }

    refreshLocation(event): void {
        const sel: Selection = document.getSelection();
        const line: HTMLElement = this.editorService.getSelectedElementParentLine(this.editor.nativeElement, sel);

        if (event.key !== 'Backspace') {
            if (line) {
                this.refreshCurrentLine(line);

                let currentIndex = 0;
                const textSegments = this.getTextSegments(line, false);

                textSegments.forEach(({text, node}) => {
                    if (node === sel.anchorNode) {
                        this.anchorIndex = currentIndex + sel.anchorOffset;
                    } else if (node.parentElement === sel.anchorNode) {
                        const range = new Range();
                        range.selectNode(node);
                        this.anchorIndex = currentIndex + sel.anchorOffset - range.startOffset;
                    }

                    if (node === sel.focusNode) {
                        this.focusIndex = currentIndex + sel.focusOffset;
                    } else if (node.parentElement === sel.focusNode) {
                        const range = new Range();
                        range.selectNode(node);
                        this.focusIndex = currentIndex + sel.focusOffset - range.startOffset;
                    }

                    currentIndex += text.length;
                });
            } else {
                this.currentLine = 0;
                this.anchorIndex = 0;
                this.focusIndex = 0;
            }
        }
    }

    restoreSelection(): void {
        const sel: Selection = window.getSelection();
        const lines: NodeList = this.editor.nativeElement.querySelectorAll('.view-line');
        const line: Node = lines[this.currentLine];
        const textSegments = this.getTextSegments(line, false);

        let anchorNode = line;
        let anchorIndex = 0;
        let focusNode = line;
        let focusIndex = 0;
        let currentIndex = 0;

        textSegments.forEach(({text, node}) => {
            const startIndexOfNode = currentIndex;
            const endIndexOfNode = startIndexOfNode + text.length;

            if (startIndexOfNode <= this.anchorIndex && this.anchorIndex <= endIndexOfNode) {
                anchorNode = node;
                anchorIndex = this.anchorIndex - startIndexOfNode;
            }

            if (startIndexOfNode <= this.focusIndex && this.focusIndex <= endIndexOfNode) {
                focusNode = node;
                focusIndex = this.focusIndex - startIndexOfNode;
            }

            currentIndex += text.length;
        });

        if (focusNode) {
            this.hightlightLine(this.getParentLine(focusNode as HTMLElement) as HTMLDivElement);
        }

        sel.setBaseAndExtent(anchorNode, anchorIndex, focusNode, focusIndex);
    }

    setLineNumberToReturn(line: Node): void {
        const lines = this.editor.nativeElement.querySelectorAll('.view-line');

        for (let i = 0; i < lines.length; i++) {
            this.currentLine = i;

            if (lines[i] === line) {
                break;
            }
        }
    }

    handleTabs(event): void {
        if (event.keyCode === 9 && event.shiftKey) {
            this.handleDeleteTab(event);
        } else if (event.keyCode === 9) {
            this.handleInsertTab(event, 1);
        }
    }

    refreshLineNumbers(): void {
        if (this.lineNumbering === 'true') {
            const lines: number = this.editor.nativeElement.querySelectorAll('.view-line').length;
            const numbers: number = this.linesNumbers.length;

            if (lines !== numbers) {
                for (let i = 0; i < lines - numbers; i++) {
                    this.linesNumbers.push(numbers + i + 1);
                }

                for (let i = 0; i < (numbers - lines) && numbers > 1; i++) {
                    this.linesNumbers.pop();
                }
            }
        }
    }

    refreshTabsCount(): void {
        const sel: Selection = document.getSelection();
        let line: HTMLElement = sel.anchorNode as HTMLElement;
        this.tabsInsideCurrentLine = 0;

        if (line) {
            while (line
                && !line.isSameNode(this.editor.nativeElement)
                && (!line.classList || !line.classList.contains('view-line'))) {

                line = line.parentElement;
            }

            let child: HTMLElement = line.firstChild as HTMLElement;
            this.tabsInsideCurrentLine = 0;

            while (child && child.classList && child.classList.contains('tab')) {
                this.tabsInsideCurrentLine++;
                child = child.nextSibling as HTMLElement;
            }
        }
    }

    onEnterPressedCreateNewLine(event) {
        if (event.keyCode === 13) {
            const sel: Selection = document.getSelection();
            const range: Range = sel.getRangeAt(0);
            const currentLine: HTMLElement = this.editorService.getSelectedElementParentLine(this.editor.nativeElement, sel);
            range.setEndAfter(currentLine.lastChild);
            const content = range.extractContents();
            range.collapse(false);
            const textContent = content.textContent;
            let newLine;

            if (textContent.lastIndexOf('}') !== -1) {
                const insideContent = textContent.substring(0, textContent.lastIndexOf('}'));
                this.editorService.addNewLine(this.editor.nativeElement, '}', true, currentLine);
                this.insertTabsOnNewLine(event);
                newLine = this.editorService.addNewLine(this.editor.nativeElement, insideContent, true, currentLine);
            } else {
                newLine = this.editorService.addNewLine(this.editor.nativeElement, textContent, true, currentLine);
            }
        }
    }

    insertTabsOnNewLine(event): void {
        if (event.keyCode === 13) {
            const sel: Selection = document.getSelection();
            let newViewLine: Node = sel.anchorNode;

            if (newViewLine.nodeName.toLowerCase() !== 'div') {
                newViewLine = newViewLine.parentElement;
            }

            const previousSibling: Node = newViewLine.previousSibling;

            if (previousSibling) {
                const prevSiblingText: string = previousSibling.textContent;

                if (prevSiblingText.lastIndexOf('{') !== -1
                    && sel.anchorNode.textContent.lastIndexOf('}') === -1) {
                    this.tabsInsideCurrentLine++;
                }

                this.handleInsertTab(event, this.tabsInsideCurrentLine);
            }

            event.preventDefault();
        }
    }

    insertBRIfLineEmpty(event: KeyboardEvent): void {
        const sel: Selection = document.getSelection();
        const anchorNode: HTMLElement = sel.anchorNode as HTMLElement;

        if (anchorNode.classList.contains('view-line') && anchorNode.childNodes.length === 0) {
            this.renderer.appendChild(anchorNode, this.renderer.createElement('br'));
        }
    }

    getTextSegments(element: Node, oneLevelChild: boolean): {text: string, node: Node}[] {
        const textSegments: {text: string, node: Node}[] = [];

        if (element) {
            Array.from(element.childNodes).forEach(node => {
                switch (node.nodeType) {
                    case Node.TEXT_NODE:
                        textSegments.push({text: node.textContent, node});
                        break;

                    case Node.ELEMENT_NODE:
                        if (oneLevelChild) {
                            textSegments.push({text: node.textContent, node});
                        } else {
                            textSegments.splice(textSegments.length, 0, ...(this.getTextSegments(node, oneLevelChild)));
                        }
                        break;

                    default:
                        throw new Error(`Unexpected node type: ${node.nodeType}`);
                }
            });
        }

        return textSegments;
    }

    initFirstViewLine(event: KeyboardEvent): void {
        if (this.editor.nativeElement.querySelectorAll('.view-line').length === 0) {
            const isTab = event.keyCode === 9;
            let input: string;

            if (event.keyCode === 219 && event.shiftKey) {
                input = '{';
            } else {
                input = String.fromCharCode(event.keyCode);
            }

            if (input && !event.getModifierState('CapsLock')) {
                input = input.toLowerCase();
            }

            if (/[a-zA-Z0-9-_@#$%^&*=()!~`:;"',\./?<>}{} ]/.test(input) || isTab) {
                this.editorService.addNewLine(this.editor.nativeElement, null, true);
            }
        }
    }

    handleDeletion(event: KeyboardEvent): void {
        if (event.key === 'Backspace') {
            const lines: NodeList = this.editor.nativeElement.querySelectorAll('.view-line');
            const currentLine: Node = lines[this.currentLine];

            if (currentLine && currentLine.textContent !== '') {
                this.history.push({
                    currentLine: this.currentLine,
                    value: this.previousText,
                    tabsInsideCurrentLine: this.tabsInsideCurrentLine,
                    anchorIndex: this.anchorIndex,
                    focusIndex: this.focusIndex,
                    previousText: this.previousText
                });
            }

            if (this.focusIndex === this.anchorIndex) {
                if (this.focusIndex > 0) {
                    this.focusIndex--;
                    this.anchorIndex--;
                } else if (currentLine && currentLine.previousSibling) {
                    this.focusIndex = currentLine.previousSibling.textContent.length;
                    this.anchorIndex = this.focusIndex;
                    this.currentLine--;
                }
            }

            if (lines.length === 1 && lines[0].textContent === '') {
                event.preventDefault();
            } else if (currentLine
                && !currentLine.previousSibling
                && currentLine.textContent === ''
                && this.currentLine > 0) {

                currentLine.parentElement.removeChild(currentLine);
                this.currentLine--;
                this.focusIndex = 0;
                this.anchorIndex = 0;
                this.refreshLineNumbers();
                event.preventDefault();
            }
        }
    }

    handleDeleteTab(event: KeyboardEvent): void {
        let node: HTMLElement = document.getSelection().anchorNode as HTMLElement;

        if (node) {
            while (node.nodeName.toLowerCase() !== 'div') {
                node = node.parentElement;
            }

            let firstSpan: HTMLElement = node.firstChild as HTMLElement;

            while (firstSpan &&  firstSpan.classList && firstSpan.classList.contains('tab') && firstSpan.nodeValue === '') {
                node.firstChild.remove();
                firstSpan = node.firstChild as HTMLElement;
            }

            if (firstSpan && firstSpan.classList && firstSpan.classList.contains('tab') && firstSpan.firstChild) {
                firstSpan.firstChild.remove();

                if (!firstSpan.firstChild) {
                    const parent = firstSpan.parentElement;
                    parent.removeChild(firstSpan);

                    if (parent.childNodes.length === 0) {
                        const br = this.renderer.createElement('br');
                        this.renderer.appendChild(parent, br);
                    }
                }
            }
        }

        event.preventDefault();
    }

    shouldHightlight(): boolean {
        return this.highlightsFor
        && this.highlightsFor.trim().length > 0
        && Object.keys(CodeType).map(value => value.toLowerCase()).includes(this.highlightsFor);
    }

    handleInsertTab(event: KeyboardEvent, tabs: number): void {
        if (tabs > 0) {
            const sel: Selection = document.getSelection();
            const range: Range = sel.getRangeAt(0);
            let anchorNode: HTMLElement = sel.anchorNode as HTMLElement;
            let span: HTMLSpanElement;
            let tab: Text;

            range.collapse(true);

            while ((!anchorNode.classList || !anchorNode.classList.contains('view-line'))
            && !anchorNode.isSameNode(this.editor.nativeElement)) {
                anchorNode = anchorNode.parentElement;
            }

            if (anchorNode instanceof HTMLDivElement) {
                this.editorService.removeBR(anchorNode as HTMLDivElement);

                for (let i = 0; i < tabs; i++) {
                    tab = this.renderer.createText('\t');
                    span = this.renderer.createElement('span');
                    this.renderer.addClass(span, 'tab');
                    this.renderer.appendChild(span, tab);
                    range.insertNode(span);
                    range.setStartAfter(tab);
                    range.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
            }
        }

        event.preventDefault();
    }
}
