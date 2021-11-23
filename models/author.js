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

const cleanUpZombieAuthors = transaction => {
    return transaction.raw(
        "SELECT id FROM authors " +
        "WHERE id NOT IN (SELECT author_id FROM quote_authors) AND " +
        "id NOT IN (SELECT author_id FROM title_authors);"
    ).then((titlelessAuthors) => {
        titlelessAuthors = titlelessAuthors.rows;
        //console.log(`Delete ${ titlelessAuthors.length } titlelessAuthors`);
        //console.log(titlelessAuthors);

        if(titlelessAuthors.length > 0) {
            titlelessAuthors = titlelessAuthors.map(author =>
                new db.Author()
                .where({ id: author.id })
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