/* Check whether all quote/title/author creation went well */
/*SELECT quotes.text, titles.id AS titleId, titles.value AS title, authors.id as authorId, authors.value AS author
FROM (((quotes LEFT JOIN titles
	  ON quotes.title_id = titles.id) LEFT JOIN title_authors
	  ON titles.id = title_authors.title_id) LEFT JOIN authors
	  ON title_authors.author_id = authors.id)
WHERE quotes.id = 17;*/

/* What's happening with quote-authors? */

/*SELECT quotes.text, authors.id, authors.value AS author
FROM ((quotes LEFT JOIN quote_authors
	  ON quotes.id = quote_authors.quote_id) LEFT JOIN authors
	  ON quote_authors.author_id = authors.id)
WHERE quotes.id = 17;*/

/* What's happening with quote-tags? */

SELECT quotes.text, tags.id, tags.value AS tag
FROM ((quotes LEFT JOIN quote_tags
	  ON quotes.id = quote_tags.quote_id) LEFT JOIN tags
	  ON quote_tags.tag_id = tags.id)
WHERE quotes.id = 17;