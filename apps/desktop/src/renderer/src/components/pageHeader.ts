/**
 * The height of a page's title row, and the floor every other page reserves for it.
 *
 * Browse's source switcher is the tallest thing that sits on a title row. Its height was
 * previously derived from its own contents, which made it depend on font metrics AND on
 * whether a mod count had loaded yet (a skeleton is not the same height as the text it
 * replaces). Both made the row a few pixels taller or shorter than the other pages, so the
 * search bar under it drifted when moving between Browse, Installed, News and the game
 * picker.
 *
 * Pinning it here is what makes them agree: TITLE_ROW_H fixes the switcher's height so it
 * cannot vary, and TITLE_ROW_MIN_H reserves exactly that much on every other page. They
 * must stay the same number.
 */
export const TITLE_ROW_H = 'h-10'
export const TITLE_ROW_MIN_H = 'min-h-10'
