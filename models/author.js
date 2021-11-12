const getAuthors = (req, res) => {
    new db.Authors()
    .orderBy("value", "ASC")
    .fetch()
    .then(authors => res.send(authors.toJSON()))
    .catch(error => res.send(error));
};

const createAuthors = (newAuthors, transaction) => {
    return Promise.all(
        newAuthors.map(newAuthor => new db.Author().save({ value: newAuthor.value }, { transacting: transaction }))
    );
};

const cleanUpZombieAuthors = (quoteId, transaction, titleId) => {
    let enquireAboutEmptyAuthorsBasedOnTitle = "";
    if(titleId) { //get all the authors of the title which was deleted 
        enquireAboutEmptyAuthorsBasedOnTitle += ("SELECT author_id " +
            "FROM title_authors " +
            `WHERE title_id = ${ parseInt(titleId) } ` +
            
            "UNION ALL ");
    }
    
    /*  Maybe the authors weren't attached to the title though; maybe they were attached to the quote
        In which case, also get all the authors that were attached to the quote deleted
        Next, make a list of all authors in db + num items they are still attached to (be it a title or a quote)
        and filter that list to those authors who only have 1 item left attached to them
        If the deleted quote/title's author is on this list, it means that the deleted quote/title
        was the only thing left attached to them, so they are now zombie authors */

    return transaction.raw( "SELECT DISTINCT author_id FROM (" +
            enquireAboutEmptyAuthorsBasedOnTitle +
            "SELECT author_id " +
            "FROM quote_authors " +
            "WHERE quote_id = ? " +
        ") AS authors_on_trial WHERE author_id IN " +
            "(SELECT author_id FROM " +
                "(   SELECT title_id as item_id, author_id " +
                    "FROM title_authors " +
                    "UNION ALL " +
                    "SELECT quote_id as item_id, author_id " +
                    "FROM quote_authors" +
                ") AS item_ids_per_author " +
            "GROUP BY author_id " +
            "HAVING COUNT(item_id) = 0" +
        ");", [ quoteId ]
    ).then((titlelessAuthors) => {
        titlelessAuthors = titlelessAuthors.rows;
        console.log(`Delete ${ titlelessAuthors.length } titlelessAuthors`);
        console.log(titlelessAuthors);

        if(titlelessAuthors.length > 0) {
            titlelessAuthors = titlelessAuthors.map(author =>
                new db.Author()
                .where({ id: author.author_id })
                .destroy({ transacting: transaction })
            );

            return Promise.all(titlelessAuthors);
        }
        
        return Promise.resolve(null);
    });
};

module.exports = {
    getAuthors,
    createAuthors,
    cleanUpZombieAuthors
};