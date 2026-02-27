import Link from "next/link";
import { notFound } from "next/navigation";

import { RecipeHeroMedia } from "@/components/RecipeHeroMedia";
import { RecipeRating } from "@/components/RecipeRating";
import { getSmoothieBySlug } from "@/lib/dataset";

export default async function SmoothieDetailPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const smoothie = await getSmoothieBySlug(slug);

  if (!smoothie) {
    notFound();
  }

  return (
    <main className="recipePage">
      <div className="recipeBackdrop" />
      <div className="recipeContainer">
        <Link href="/" className="backLink">
          ← Retour aux smoothies
        </Link>

        <section className="recipeHero">
          <RecipeHeroMedia
            id={smoothie.id}
            title={smoothie.title}
            ingredients={smoothie.ingredients}
            imageUrl={smoothie.imageUrl}
          />

          <div className="recipeHeroContent">
            <p className="eyebrow">Recette</p>
            <h1>{smoothie.title}</h1>
            <p className="recipeSubtitle">
              {smoothie.source}
              {smoothie.portions ? ` • Portions ${smoothie.portions}` : ""}
            </p>

            <div className="recipeTagRow">
              <span className={`smTag ${smoothie.tags.vegan ? "smTagGood" : ""}`}>
                {smoothie.tags.vegan ? "Vegan" : "Non vegan"}
              </span>
              <span className={`smTag ${smoothie.tags.lactose ? "smTagWarn" : ""}`}>
                {smoothie.tags.lactose ? "Contient lactose" : "Sans lactose détecté"}
              </span>
              {smoothie.tags.nuts ? <span className="smTag smTagWarn">Fruits à coque</span> : null}
              {smoothie.tags.peanut ? <span className="smTag smTagWarn">Arachide</span> : null}
              {smoothie.tags.soy ? <span className="smTag smTagWarn">Soja</span> : null}
              {smoothie.tags.gluten ? <span className="smTag smTagWarn">Gluten (détecté)</span> : null}
              {smoothie.tags.sesame ? <span className="smTag smTagWarn">Sésame</span> : null}
            </div>

            <RecipeRating recipeId={smoothie.id} />

            {smoothie.sourceLink ? (
              <a className="sourceLink" href={smoothie.sourceLink} target="_blank" rel="noreferrer">
                Ouvrir la source originale
              </a>
            ) : null}
          </div>
        </section>

        <section className="recipeGrid">
          <article className="recipePanel">
            <h2>Ingrédients</h2>
            <ul className="recipeList">
              {smoothie.ingredientLines.length > 0 ? (
                smoothie.ingredientLines.map((line, index) => <li key={`${line}-${index}`}>{line}</li>)
              ) : (
                <li>{smoothie.ingredientsRaw || "Non renseigné"}</li>
              )}
            </ul>
          </article>

          <article className="recipePanel">
            <h2>Préparation</h2>
            <ol className="recipeSteps">
              {smoothie.directions.length > 0 ? (
                smoothie.directions.map((step, index) => <li key={`${step}-${index}`}>{step}</li>)
              ) : (
                <li>Préparation non renseignée.</li>
              )}
            </ol>
          </article>
        </section>
      </div>
    </main>
  );
}
