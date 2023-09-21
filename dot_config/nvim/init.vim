call plug#begin('~/.vim/plugged')

Plug 'vim-jp/vimdoc-ja'
Plug 'junegunn/fzf', {'dir': '~/.fzf_bin', 'do': './install --all'}
Plug 'neoclide/coc.nvim', {'branch': 'release'}
Plug 'lambdalisue/fern.vim'
Plug 'nvim-treesitter/nvim-treesitter'
Plug 'sainnhe/gruvbox-material'

call plug#end()

" set options
set termguicolors
set number
set updatetime=500
set expandtab
set tabstop=2

" map prefix
let g:mapleader = "\<Space>"
nnoremap <Leader>    <Nop>
xnoremap <Leader>    <Nop>
nnoremap <Plug>(lsp) <Nop>
xnoremap <Plug>(lsp) <Nop>
nmap     m           <Plug>(lsp)
xmap     m           <Plug>(lsp)
nnoremap <Plug>(ff)  <Nop>
xnoremap <Plug>(ff)  <Nop>
nmap     ;           <Plug>(ff)
xmap     ;           <Plug>(ff)

"" fern.vim
nnoremap <silent> <Leader>e <Cmd>Fern . -drawer<CR>
nnoremap <silent> <Leader>E <Cmd>Fern . -drawer -reveal=%<CR>

"" coc.nvim
let g:coc_global_extensions = ['coc-tsserver', 'coc-eslint', 'coc-prettier', 'coc-git', 'coc-fzf-preview', 'coc-lists']

inoremap <silent> <expr> <C-Space> coc#refresh()

nnoremap <silent> K             <Cmd>call <SID>show_documentation()<CR>
nmap     <silent> <Plug>(lsp)rn <Plug>(coc-rename)
nmap     <silent> <Plug>(lsp)a  <Plug>(coc-codeaction-cursor)

function! s:coc_typescript_settings() abort
  nnoremap <silent> <buffer> <Plug>(lsp)f :<C-u>CocCommand eslint.executeAutofix<CR>:CocCommand prettier.formatFile<CR>
endfunction

augroup coc_ts
  autocmd!
  autocmd FileType typescript,typescriptreact call <SID>coc_typescript_settings()
augroup END

function! s:show_documentation() abort
  if index(['vim','help'], &filetype) >= 0
    execute 'h ' . expand('<cword>')
  elseif coc#rpc#ready()
    call CocActionAsync('doHover')
  endif
endfunction

if empty(glob('~/.config/coc/extensions/node_modules/coc-explorer'))
  autocmd VimEnter * CocInstall coc-explorer
endif


"" fzf-preview
let $BAT_THEME                     = 'gruvbox-dark'
let $FZF_PREVIEW_PREVIEW_BAT_THEME = 'gruvbox-dark'

nnoremap <silent> <Plug>(ff)r  <Cmd>CocCommand fzf-preview.ProjectFiles<CR>
nnoremap <silent> <Plug>(ff)s  <Cmd>CocCommand fzf-preview.GitStatus<CR>
nnoremap <silent> <Plug>(ff)gg <Cmd>CocCommand fzf-preview.GitActions<CR>
nnoremap <silent> <Plug>(ff)b  <Cmd>CocCommand fzf-preview.Buffers<CR>
nnoremap          <Plug>(ff)f  :<C-u>CocCommand fzf-preview.ProjectGrep --add-fzf-arg=--exact --add-fzf-arg=--no-sort<Space>

nnoremap <silent> <Plug>(lsp)q  <Cmd>CocCommand fzf-preview.CocCurrentDiagnostics<CR>
nnoremap <silent> <Plug>(lsp)rf <Cmd>CocCommand fzf-preview.CocReferences<CR>
nnoremap <silent> <Plug>(lsp)d  <Cmd>CocCommand fzf-preview.CocDefinition<CR>
nnoremap <silent> <Plug>(lsp)t  <Cmd>CocCommand fzf-preview.CocTypeDefinition<CR>
nnoremap <silent> <Plug>(lsp)o  <Cmd>CocCommand fzf-preview.CocOutline --add-fzf-arg=--exact --add-fzf-arg=--no-sort<CR>

"" treesitter
lua <<EOF
require('nvim-treesitter.configs').setup {
  ensure_installed = {
    "typescript",
    "tsx",
  },
  highlight = {
    enable = true,
  },
}
EOF

"" gruvbox
colorscheme gruvbox-material

" c-q: quit (save if named file, force quit if unnamed)
nnoremap <C-q> :if &modified \| w \| else \| q! \| endif<CR>
inoremap <C-q> <Esc>:if &modified \| w \| else \| q! \| endif<CR>

" c-w: close tab
nnoremap <C-w> :tabclose<CR>
inoremap <C-w> <Esc>:tabclose<CR>

" c-e: open finder (using fzf)
nnoremap <C-e> :Files<CR>
inoremap <C-e> <Esc>:Files<CR>

" c-t: toggle to terminal (open terminal in insert mode, return to insert mode editor if in terminal)
nnoremap <C-t> :terminal<CR>a
tnoremap <C-t> <C-\><C-n>a

" c-y: redo
nnoremap <C-y> :redo<CR>
inoremap <C-y> <Esc>:redo<CR>a

" c-u: undo
nnoremap <C-u> :undo<CR>
inoremap <C-u> <Esc>:undo<CR>a

" c-p: to terminal
nnoremap <C-p> :terminal<CR>
inoremap <C-p> <Esc>:terminal<CR>

" c-a: select all
nnoremap <C-a> ggVG
inoremap <C-a> <Esc>ggVG

" c-s: save
nnoremap <C-s> :w<CR>
inoremap <C-s> <Esc>:w<CR>

" c-d: select duplicate word
xnoremap <C-d> :call CocAction('selectCurrentWord')<CR>
inoremap <C-d> <Esc>:call CocAction('selectCurrentWord')<CR>

" c-f: find
nnoremap <C-f> :Rg<CR>
inoremap <C-f> <Esc>:Rg<CR>

" c-g: to line
nnoremap <C-g> :
inoremap <C-g> :

" c-h: replace
nnoremap <C-h> :%s///g<Left><Left>
inoremap <C-h> :%s///g<Left><Left>

" c-j: open jumpy
nnoremap <C-j> :EasyMotion-jk<CR>
inoremap <C-j> :EasyMotion-jk<CR>

" c-l: expand selection
vnoremap <C-l> v

" c-z: undo
nnoremap <C-z> u
inoremap <C-z> u

" c-x: cut
vnoremap <C-x> d

" c-c: copy
vnoremap <C-c> y

" c-v: paste
nnoremap <C-v> p

" c-b: toggle sidebar
nnoremap <C-b> :NERDTreeToggle<CR>
inoremap <C-b> :NERDTreeToggle<CR>

" c-n: new window
nnoremap <C-n> :new<CR>
inoremap <C-n> :new<CR>

" c-m: open explorer
nnoremap <C-m> :CocCommand explorer<CR>
inoremap <C-m> <ESC>:CocCommand explorer<CR>